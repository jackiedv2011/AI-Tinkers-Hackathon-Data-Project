# macOS handoff and verification

Passing this checklist on a physical Mac is enough to claim that the hackathon MVP has been demonstrated on that Mac and architecture. It is not a substitute for broader Intel/Apple Silicon, OS-version, signing, notarization, and long-duration production testing.

## Setup

```bash
git pull
pnpm install
cp .env.example .env.local
```

Open `.env.local` locally and set `OPENAI_API_KEY`. Never commit that file. The default `gpt-5.6-luna` model can be changed with `LIFEGUARD_REASONING_MODEL`.

The verification script reads the project `.env.local`. A normally installed app can instead read `.env.local` from its macOS user-data directory (`~/Library/Application Support/Lifeguard/`) so the key never has to be bundled into the application or repository.

## Test the reasoning connection

```bash
pnpm reasoning:check
```

This sends one synthetic, anonymized candidate. It does not transmit a local path or file content.

## Run the complete macOS suite

Quit any running Lifeguard instance, then run:

```bash
bash scripts/verify-mac.sh
```

The suite runs unit tests, type checking, packaging, fixed-volume discovery, bounded indexing, duplicate cleanup, stale-temporary-file cleanup, SHA-256 integrity verification, quarantine, restoration, and the isolated memory worker. All filesystem mutations are checked to remain inside Lifeguard-owned fixture directories.

## Manual checks

1. Confirm the dashboard lists the Mac's internal fixed volume.
2. Confirm **Context reasoner** shows `READY` and `gpt-5.6-luna` after a candidate is assessed.
3. Click **Stage safe live demo** and confirm completed actions appear without another approval prompt.
4. Restore one held item and confirm the recovery entry appears.
5. Grant Accessibility permission only if you want to test foreground-aware management of real applications. Without that permission, Lifeguard fails closed and does not close real apps.

Record the Mac model, chip, macOS version, test output, and a short screen capture for the submission evidence.
