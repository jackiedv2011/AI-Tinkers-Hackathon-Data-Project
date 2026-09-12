import unittest


class CliTests(unittest.TestCase):
    def test_run_command_keeps_child_arguments(self):
        from lifeguard.__main__ import build_parser

        args = build_parser().parse_args(["run", "--project", "demo", "--", "python", "worker_demo.py", "--fast"])
        self.assertEqual(args.project, "demo")
        self.assertEqual(args.command, ["--", "python", "worker_demo.py", "--fast"])


if __name__ == "__main__":
    unittest.main()
