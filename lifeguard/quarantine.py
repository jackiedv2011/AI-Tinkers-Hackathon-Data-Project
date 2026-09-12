"""Same-volume, journaled quarantine for project-contained files."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from .policy.paths import contained_in, is_protected_path

QUARANTINE_ROOT = Path.home() / ".lifeguard" / "quarantine"
INSTALL_ROOT = Path(__file__).resolve().parents[1]


def _write_journal(path: Path, entry: dict[str, str]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(entry, indent=2), encoding="utf-8")
    temporary.replace(path)


def recover_incomplete(quarantine_root: Path = QUARANTINE_ROOT) -> list[dict[str, str]]:
    """Reconcile journal state without moving or deleting additional user data."""
    outcomes: list[dict[str, str]] = []
    if not quarantine_root.exists():
        return outcomes
    for journal in quarantine_root.glob("*.journal"):
        try:
            entry = json.loads(journal.read_text(encoding="utf-8"))
            if entry.get("state") == "COMMITTED":
                continue
            source = Path(entry["src"])
            destination = Path(entry["dest"])
            if destination.exists() and not source.exists():
                entry["state"] = "MOVED"
                _write_journal(journal, entry)
                entry["state"] = "COMMITTED"
                _write_journal(journal, entry)
                outcome = "committed_existing_move"
            elif source.exists() and not destination.exists():
                outcome = "prepared_no_move"
            else:
                outcome = "inconsistent_manual_review"
            outcomes.append({"journal": str(journal), "outcome": outcome})
        except (OSError, KeyError, TypeError, ValueError):
            outcomes.append({"journal": str(journal), "outcome": "invalid_manual_review"})
    return outcomes


def quarantine_file(src: Path, project_root: Path, *, quarantine_root: Path = QUARANTINE_ROOT) -> dict[str, str | int]:
    real = contained_in(project_root, src)
    if real is None:
        raise ValueError("Path not contained or traverses symlink/reparse point")
    if is_protected_path(real, INSTALL_ROOT):
        raise ValueError("Protected source path")
    if is_protected_path(quarantine_root, INSTALL_ROOT, strict=False):
        raise ValueError("Protected quarantine destination")
    quarantine_root.mkdir(parents=True, exist_ok=True)
    if real.drive.casefold() != quarantine_root.resolve().drive.casefold():
        raise ValueError("Quarantine must be on the same volume")
    destination_name = uuid.uuid4().hex
    destination = quarantine_root / destination_name
    journal = quarantine_root / f"{destination_name}.journal"
    entry = {"state": "PREPARED", "src": str(real), "dest": str(destination)}
    _write_journal(journal, entry)
    real.rename(destination)
    entry["state"] = "MOVED"
    _write_journal(journal, entry)
    if real.exists() or not destination.exists():
        raise OSError("Quarantine move could not be confirmed")
    entry["state"] = "COMMITTED"
    _write_journal(journal, entry)
    return {
        "src": str(real),
        "dest": str(destination),
        "quarantined_bytes": destination.stat().st_size,
        "reclaimed_bytes": 0,
    }
