import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch


class ReasoningTests(unittest.TestCase):
    def test_prompt_exposes_capabilities_but_not_raw_pids(self):
        from lifeguard.reasoning import build_prompt

        prompt = build_prompt(
            {"available_mb": 900, "total_mb": 16000, "percent": 94.0},
            [{"target_id": "cap-abc", "pid": 1234, "rss_mb": 180, "cpu_pct": 35.0, "running": True, "evidence_lines": ["worker pid 1234 retry"]}],
        )
        self.assertIn("cap-abc", prompt)
        self.assertIn('"rss_mb": 180', prompt)
        self.assertNotIn("1234", prompt)
        self.assertIn("worker pid <number> retry", prompt)

    def test_analyze_uses_sdk_15_strict_schema_shape(self):
        from lifeguard.reasoning import SCHEMA, analyze

        captured = {}

        class Messages:
            def create(self, **kwargs):
                captured.update(kwargs)
                text = json.dumps(
                    {
                        "diagnosis": "growth",
                        "evidence_ids": ["sample-1"],
                        "cited_lines": [],
                        "confidence": "high",
                        "action": "throttle_task",
                        "target_id": "cap-abc",
                    }
                )
                return SimpleNamespace(content=[SimpleNamespace(text=text)])

        fake_client = SimpleNamespace(messages=Messages())
        fake_anthropic = SimpleNamespace(
            Anthropic=lambda **kwargs: (captured.update(client=kwargs) or fake_client)
        )
        with patch.dict(sys.modules, {"anthropic": fake_anthropic}):
            result = analyze(
                {"available_mb": 900, "total_mb": 16000, "percent": 94.0},
                [{"target_id": "cap-abc", "rss_mb": 180, "cpu_pct": 35.0, "running": True}],
            )
        self.assertEqual(captured["client"], {"max_retries": 1})
        self.assertEqual(captured["output_config"], {"format": {"type": "json_schema", "schema": SCHEMA}})
        self.assertEqual(result["action"], "throttle_task")


class FakeProcess:
    def __init__(self, pid, created=5.0):
        self.pid = pid
        self.created = created
        self.terminated = False
        self.killed = False

    def create_time(self):
        return self.created

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True


class ActionTests(unittest.TestCase):
    def test_stop_revalidates_identity_and_uses_terminate(self):
        from lifeguard.actions import execute_action

        process = FakeProcess(8)
        execute_action("stop_task", {"pid": 8, "create_time": 5.0}, process_factory=lambda _pid: process)
        self.assertTrue(process.terminated)
        self.assertFalse(process.killed)

    def test_action_refuses_recycled_pid(self):
        from lifeguard.actions import execute_action

        with self.assertRaises(RuntimeError):
            execute_action("stop_task", {"pid": 8, "create_time": 5.0}, process_factory=lambda _pid: FakeProcess(8, 6.0))


if __name__ == "__main__":
    unittest.main()
