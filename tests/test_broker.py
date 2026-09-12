import unittest
from pathlib import Path


class FakeRegistry:
    def __init__(self, entry):
        self.entry = entry

    def resolve(self, _target_id):
        return self.entry


class FakeProcess:
    def __init__(self, pid, created=3.0, parent=None, children=()):
        self.pid = pid
        self._created = created
        self._parent = parent
        self._children = list(children)

    def create_time(self):
        return self._created

    def parent(self):
        return self._parent

    def children(self, recursive=False):
        return self._children


class BrokerTests(unittest.TestCase):
    def setUp(self):
        from lifeguard.policy.broker import Broker

        self.task = {
            "pid": 22,
            "create_time": 3.0,
            "owned_channel": True,
            "protected": False,
            "path": str(Path.cwd()),
            "evidence_lines": ["retry", "retry", "retry"],
        }
        self.processes = {22: FakeProcess(22), 99: FakeProcess(99)}
        self.broker = Broker(
            FakeRegistry(self.task),
            process_factory=lambda pid: self.processes[pid],
            policy_version="v1",
        )

    def proposal(self, **changes):
        proposal = {
            "proposal_id": "p1",
            "target_id": "target-1",
            "action": "throttle_task",
            "policy_version": "v1",
            "expires_at": 200.0,
            "cited_lines": [],
        }
        proposal.update(changes)
        return proposal

    def test_allows_managed_background_task(self):
        verdict = self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100)
        self.assertTrue(verdict.allowed)

    def test_fails_closed_for_stale_policy_unknown_foreground_and_protection(self):
        self.assertEqual(self.broker.admissible(self.proposal(policy_version="old"), {"foreground_pid": 99}, now=100).reason, "policy_changed")
        self.assertEqual(self.broker.admissible(self.proposal(expires_at=99), {"foreground_pid": 99}, now=100).reason, "stale_approval")
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": None}, now=100).reason, "foreground_unknown")
        self.task["protected"] = True
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "protected")

    def test_foreground_family_and_stop_evidence_are_denied(self):
        self.processes[99] = FakeProcess(99, children=[FakeProcess(22)])
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "foreground")
        self.processes[99] = FakeProcess(99)
        verdict = self.broker.admissible(self.proposal(action="stop_task", cited_lines=["retry", "retry"]), {"foreground_pid": 99}, now=100)
        self.assertEqual(verdict.reason, "evidence_not_reproduced")

    def test_unknown_recycled_and_unmanaged_targets_are_denied(self):
        self.broker.registry.entry = None
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "unknown_target")
        self.broker.registry.entry = self.task
        self.processes[22]._created = 4.0
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "identity_uncertain")
        self.processes[22]._created = 3.0
        self.task["owned_channel"] = False
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "not_managed")

    def test_foreground_parent_is_denied(self):
        self.processes[99] = FakeProcess(99, parent=FakeProcess(22))
        self.assertEqual(self.broker.admissible(self.proposal(), {"foreground_pid": 99}, now=100).reason, "foreground")


if __name__ == "__main__":
    unittest.main()
