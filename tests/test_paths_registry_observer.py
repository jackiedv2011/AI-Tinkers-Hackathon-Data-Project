import tempfile
import unittest
from pathlib import Path


class FakeProcess:
    def __init__(self, pid, created=10.0):
        self.pid = pid
        self.created = created
        self.cpu_calls = 0

    def create_time(self):
        return self.created

    def oneshot(self):
        class Context:
            def __enter__(inner):
                return self

            def __exit__(inner, *_):
                return False

        return Context()

    def memory_info(self):
        return type("Memory", (), {"rss": 8 << 20})()

    def cpu_percent(self):
        self.cpu_calls += 1
        return float(self.cpu_calls)

    def is_running(self):
        return True


class PathPolicyTests(unittest.TestCase):
    def test_containment_is_component_aware(self):
        from lifeguard.policy.paths import contained_in

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            sibling = Path(folder) / "project-copy"
            root.mkdir()
            sibling.mkdir()
            inside = root / "data.bin"
            outside = sibling / "data.bin"
            inside.write_bytes(b"inside")
            outside.write_bytes(b"outside")
            self.assertEqual(contained_in(root, inside), inside.resolve())
            self.assertIsNone(contained_in(root, outside))


class RegistryAndObserverTests(unittest.TestCase):
    def test_registry_rejects_recycled_pid_and_reuses_process_object(self):
        from lifeguard.registry import ProcessRegistry

        with tempfile.TemporaryDirectory() as folder:
            process = FakeProcess(42)
            registry = ProcessRegistry(Path(folder) / "registry.json", process_factory=lambda _pid: process)
            target_id = registry.register(42, "demo", folder, ["demo.exe"])
            first = registry.get_managed_tasks()[0]["proc"]
            second = registry.get_managed_tasks()[0]["proc"]
            self.assertIs(first, second)
            process.created = 11.0
            self.assertIsNone(registry.resolve(target_id))

    def test_task_sample_uses_supplied_long_lived_process(self):
        from lifeguard.observer import task_sample

        process = FakeProcess(7)
        first = task_sample(process)
        second = task_sample(process)
        self.assertEqual(first["pid"], 7)
        self.assertEqual((first["cpu_pct"], second["cpu_pct"]), (1.0, 2.0))
        self.assertEqual(first["rss_mb"], 8)


if __name__ == "__main__":
    unittest.main()
