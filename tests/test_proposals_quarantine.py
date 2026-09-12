import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ProposalStoreTests(unittest.TestCase):
    def test_claim_is_hash_bound_and_single_use(self):
        from lifeguard.proposals import ProposalStore

        store = ProposalStore()
        proposal = store.add({"action": "observe", "target_id": "target-1"})
        self.assertIsNone(store.claim(proposal["proposal_id"], "wrong"))
        self.assertEqual(store.claim(proposal["proposal_id"], proposal["proposal_hash"]), proposal)
        self.assertIsNone(store.claim(proposal["proposal_id"], proposal["proposal_hash"]))


class QuarantineTests(unittest.TestCase):
    def test_quarantine_commits_journal_and_reports_staged_bytes(self):
        from lifeguard.quarantine import quarantine_file

        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            project = base / "project"
            quarantine = base / "quarantine"
            project.mkdir()
            source = project / "duplicate.bin"
            source.write_bytes(b"12345")
            result = quarantine_file(source, project, quarantine_root=quarantine)
            self.assertFalse(source.exists())
            self.assertEqual(result["quarantined_bytes"], 5)
            self.assertEqual(result["reclaimed_bytes"], 0)
            journal = json.loads(next(quarantine.glob("*.journal")).read_text(encoding="utf-8"))
            self.assertEqual(journal["state"], "COMMITTED")

    def test_quarantine_refuses_protected_source_even_when_root_matches(self):
        from lifeguard.quarantine import quarantine_file

        with tempfile.TemporaryDirectory() as folder:
            protected = Path(folder) / "protected"
            quarantine = Path(folder) / "quarantine"
            protected.mkdir()
            source = protected / "system.bin"
            source.write_bytes(b"do not move")
            with patch.dict(os.environ, {"WINDIR": str(protected)}):
                with self.assertRaises(ValueError):
                    quarantine_file(source, protected, quarantine_root=quarantine)
            self.assertTrue(source.exists())

    def test_recovery_commits_move_completed_before_journal_update(self):
        from lifeguard.quarantine import recover_incomplete

        with tempfile.TemporaryDirectory() as folder:
            quarantine = Path(folder)
            source = quarantine / "original.bin"
            destination = quarantine / "random-destination"
            destination.write_bytes(b"moved")
            journal = quarantine / "random-destination.journal"
            journal.write_text(
                json.dumps({"state": "PREPARED", "src": str(source), "dest": str(destination)}),
                encoding="utf-8",
            )
            outcomes = recover_incomplete(quarantine)
            self.assertEqual(outcomes[0]["outcome"], "committed_existing_move")
            self.assertEqual(json.loads(journal.read_text(encoding="utf-8"))["state"], "COMMITTED")


if __name__ == "__main__":
    unittest.main()
