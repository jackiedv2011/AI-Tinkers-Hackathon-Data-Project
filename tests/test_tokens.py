import unittest
from unittest.mock import patch


class TokenTests(unittest.TestCase):
    def setUp(self):
        from lifeguard import tokens

        tokens.USED.clear()

    def test_token_is_single_use(self):
        from lifeguard.tokens import consume, mint

        token = mint("proposal-1", "approve", "hash-1")
        self.assertEqual(
            consume(token),
            {"proposal_id": "proposal-1", "decision": "approve", "proposal_hash": "hash-1"},
        )
        self.assertIsNone(consume(token))

    def test_tampering_and_expiry_are_rejected(self):
        from lifeguard.tokens import consume, mint

        with patch("lifeguard.tokens.time.time", return_value=100):
            token = mint("proposal-1", "approve", "hash-1", ttl=5)
        self.assertIsNone(consume(token[:-1] + ("A" if token[-1] != "A" else "B")))
        with patch("lifeguard.tokens.time.time", return_value=106):
            self.assertIsNone(consume(token))


if __name__ == "__main__":
    unittest.main()
