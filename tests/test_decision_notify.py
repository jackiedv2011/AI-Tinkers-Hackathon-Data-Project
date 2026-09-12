import unittest
import warnings

warnings.filterwarnings(
    "ignore",
    message="The anyio.abc.BlockingPortal alias is deprecated",
    category=DeprecationWarning,
)

from fastapi.testclient import TestClient


class FakeStore:
    def __init__(self, proposal):
        self.proposal = proposal
        self.claimed = False

    def claim(self, proposal_id, proposal_hash):
        if self.claimed or proposal_id != "p1" or proposal_hash != "h1":
            return None
        self.claimed = True
        return self.proposal


class FakeRegistry:
    def resolve(self, target_id):
        return {"target_id": target_id, "pid": 9, "create_time": 1.0}


class FakeBroker:
    def __init__(self, allowed=True):
        self.allowed = allowed

    def admissible(self, proposal, fresh):
        from lifeguard.policy.broker import Verdict

        return Verdict(self.allowed, "allowed" if self.allowed else "foreground", proposal["action"] if self.allowed else None)


class DecisionTests(unittest.TestCase):
    def token_consumer(self, _token):
        return {"proposal_id": "p1", "decision": "approve", "proposal_hash": "h1"}

    def test_approve_observes_brokers_then_executes(self):
        from lifeguard.server import DecisionService

        events = []
        proposal = {"proposal_id": "p1", "proposal_hash": "h1", "action": "throttle_task", "target_id": "cap-1"}
        service = DecisionService(
            FakeStore(proposal),
            FakeRegistry(),
            FakeBroker(),
            consume_token=self.token_consumer,
            observe=lambda: events.append("observe") or {"foreground_pid": 99},
            execute=lambda action, task: events.append(("execute", action, task["target_id"])),
            confirm=lambda outcome: events.append(("confirm", outcome)),
        )
        self.assertEqual(service.decide("Bearer token", {"decision": "approve"}), {"status": "ok", "action": "throttle_task"})
        self.assertEqual(events, ["observe", ("execute", "throttle_task", "cap-1"), ("confirm", "Approved: throttle_task")])

    def test_deny_consumes_proposal_without_execution(self):
        from lifeguard.server import DecisionService

        proposal = {"proposal_id": "p1", "proposal_hash": "h1", "action": "stop_task", "target_id": "cap-1"}
        events = []
        service = DecisionService(
            FakeStore(proposal),
            FakeRegistry(),
            FakeBroker(),
            consume_token=lambda _token: {"proposal_id": "p1", "decision": "deny", "proposal_hash": "h1"},
            execute=lambda *_args: events.append("executed"),
            confirm=lambda outcome: events.append(outcome),
        )
        self.assertEqual(service.decide("Bearer token", {"decision": "deny"}), {"status": "denied"})
        self.assertEqual(events, ["Denied"])


class DecisionEndpointTests(unittest.TestCase):
    @staticmethod
    def client(*, payload=None, store=None):
        from lifeguard.server import DecisionService, create_app

        proposal = {"proposal_id": "p1", "proposal_hash": "h1", "action": "stop_task", "target_id": "cap-1"}
        service = DecisionService(
            store or FakeStore(proposal),
            FakeRegistry(),
            FakeBroker(),
            consume_token=lambda _token: payload,
            confirm=lambda _outcome: None,
        )
        return TestClient(create_app(service))

    def test_endpoint_requires_well_formed_authorization_header(self):
        client = self.client(payload=None)
        self.assertEqual(client.post("/decision", json={"decision": "approve"}).status_code, 401)
        self.assertEqual(client.post("/decision", headers={"Authorization": "token"}, json={"decision": "approve"}).status_code, 401)

    def test_endpoint_rejects_body_mismatch_and_changed_proposal(self):
        payload = {"proposal_id": "p1", "decision": "deny", "proposal_hash": "h1"}
        client = self.client(payload=payload)
        self.assertEqual(client.post("/decision", headers={"Authorization": "Bearer token"}, json={"decision": "approve"}).status_code, 403)
        changed = {"proposal_id": "p1", "decision": "approve", "proposal_hash": "changed"}
        client = self.client(payload=changed)
        self.assertEqual(client.post("/decision", headers={"Authorization": "Bearer token"}, json={"decision": "approve"}).status_code, 409)

    def test_endpoint_surfaces_token_reuse(self):
        from lifeguard.server import DecisionService, create_app

        calls = 0

        def consume(_token):
            nonlocal calls
            calls += 1
            if calls > 1:
                return None
            return {"proposal_id": "p1", "decision": "deny", "proposal_hash": "h1"}

        proposal = {"proposal_id": "p1", "proposal_hash": "h1", "action": "stop_task", "target_id": "cap-1"}
        service = DecisionService(FakeStore(proposal), FakeRegistry(), FakeBroker(), consume_token=consume, confirm=lambda _outcome: None)
        client = TestClient(create_app(service))
        headers = {"Authorization": "Bearer token"}
        self.assertEqual(client.post("/decision", headers=headers, json={"decision": "deny"}).status_code, 200)
        self.assertEqual(client.post("/decision", headers=headers, json={"decision": "deny"}).status_code, 403)


class NotifyTests(unittest.TestCase):
    def test_action_tokens_are_headers_not_urls(self):
        from lifeguard.notify import action_header

        value = action_header("approve-secret", "deny-secret", "https://callback.example")
        self.assertIn("headers.Authorization=Bearer approve-secret", value)
        self.assertIn("headers.Authorization=Bearer deny-secret", value)
        self.assertNotIn("?token", value)
        self.assertIn("method=POST", value)


if __name__ == "__main__":
    unittest.main()
