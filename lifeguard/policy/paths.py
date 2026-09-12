"""Component-aware path containment and hard protection rules."""

from __future__ import annotations

import os
from pathlib import Path


def _is_link_or_junction(path: Path) -> bool:
    try:
        if path.is_symlink():
            return True
        is_junction = getattr(path, "is_junction", None)
        return bool(is_junction and is_junction())
    except OSError:
        return True


def contained_in(root: Path, candidate: Path) -> Path | None:
    try:
        lexical_base = Path(os.path.abspath(root))
        lexical_candidate = Path(os.path.abspath(candidate))
        lexical_relative = lexical_candidate.relative_to(lexical_base)
        if _is_link_or_junction(lexical_base):
            return None
        current = lexical_base
        for segment in lexical_relative.parts:
            current = current / segment
            if _is_link_or_junction(current):
                return None
        real = candidate.resolve(strict=True)
        base = root.resolve(strict=True)
        relative = real.relative_to(base)
    except (OSError, ValueError):
        return None
    return real


def protected_roots(install_dir: Path | None = None) -> tuple[Path, ...]:
    candidates = [
        os.environ.get("WINDIR"),
        os.environ.get("PROGRAMFILES"),
        os.environ.get("PROGRAMFILES(X86)"),
    ]
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.append(str(Path(appdata) / "Microsoft"))
    if install_dir:
        candidates.append(str(install_dir))
    return tuple(Path(value) for value in candidates if value)


def is_protected_path(candidate: Path, install_dir: Path | None = None, *, strict: bool = True) -> bool:
    try:
        real = candidate.resolve(strict=strict)
    except OSError:
        return True
    for root in protected_roots(install_dir):
        try:
            base = root.resolve(strict=True)
            real.relative_to(base)
            return True
        except (OSError, ValueError):
            continue
    return False
