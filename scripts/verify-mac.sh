#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOWER_STATE="$HOME/Library/Application Support/lifeguard/lifeguard-state.json"
UPPER_STATE="$HOME/Library/Application Support/Lifeguard/lifeguard-state.json"
STATE_PATH="$LOWER_STATE"
if [[ -f "$UPPER_STATE" ]]; then STATE_PATH="$UPPER_STATE"; fi
BASELINE="$(mktemp -t lifeguard-baseline.XXXXXX)"
trap 'rm -f "$BASELINE"' EXIT

cd "$PROJECT_ROOT"
node scripts/native-state-check.mjs snapshot "$STATE_PATH" "$BASELINE"
pnpm test
pnpm exec tsc --noEmit
pnpm package

APP_BIN="$(find "$PROJECT_ROOT/dist" -path '*/Lifeguard.app/Contents/MacOS/Lifeguard' -type f | head -n 1)"
if [[ -z "$APP_BIN" ]]; then
  echo 'Could not locate the packaged Lifeguard.app executable.' >&2
  exit 1
fi

"$APP_BIN" --lifeguard-self-test
if [[ -f "$UPPER_STATE" ]]; then STATE_PATH="$UPPER_STATE"; else STATE_PATH="$LOWER_STATE"; fi
node scripts/native-state-check.mjs verify "$STATE_PATH" "$BASELINE"

echo 'macOS native verification passed. Starting the packaged app with the current project environment.'
"$APP_BIN" >/dev/null 2>&1 &
