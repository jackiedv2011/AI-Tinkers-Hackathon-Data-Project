# Lifeguard handoff

## Current state

- Repository: `https://github.com/jackiedv2011/AI-Tinkers-Hackathon-Data-Project`
- Branch: `main`
- Latest application-delivery commit: `4dab688` — **Harden autonomous backend and add demo clip**. This handoff is committed immediately afterward.
- Platform scope: Windows and macOS desktop only. There is no iOS or mobile claim.
- Windows package: `dist/Lifeguard Setup 0.1.0.exe`
- Short video: [media/Lifeguard-15s-autonomous-demo.mp4](../media/Lifeguard-15s-autonomous-demo.mp4), 14.5 seconds.

The packaged Windows application is currently running once in hidden background mode. It is configured to start at login only from a packaged build, not from development.

## Product in one sentence

Lifeguard is an autonomous desktop resource guardian: it observes whole-drive and desktop context in bounded background slices, then makes only high-confidence, reversible moves while avoiding the user's active work.

## What works now

- Discovers fixed local drives on Windows and macOS.
- Persists an incremental, budgeted whole-drive indexing queue across launches.
- Detects exact duplicates through size grouping plus SHA-256 verification.
- Identifies only recognized stale cache/temp locations as disposable.
- Hard-excludes system paths, app installs, protected folders, non-disposable app data, `.git`, `node_modules`, cloud-sync clients, security tools, foreground apps, and symbolic links.
- Moves eligible items into recoverable quarantine with a hash, reason, timestamp, and restore path.
- Rechecks type, size, modification time, and hash immediately before an action; a delayed model response cannot act on a changed file.
- Hash-verifies a cross-volume copy before removing its source.
- Closes only restartable, allowlisted apps that have been idle for 45 minutes and only while RAM is constrained. The demo worker exits gracefully through IPC.
- Runs in the tray, holds one application instance, starts silently at login, and does not block display sleep.
- Includes an isolated demo path (`--lifeguard-video-demo`) that stages synthetic duplicates, a stale temporary file, and a memory worker automatically for recording.

## Reasoning model

The optional OpenAI reasoner is configured for:

```text
model: gpt-5.6-luna
reasoning effort: medium
API: Responses API structured output
store: false
```

It receives anonymous candidate features only: fingerprint, category, extension, size bucket, age, coarse location class, deterministic importance, and safety evidence. It never receives raw paths, filenames, file contents, or application names.

The model can return only `protect` or `neutral`. `protect` vetoes an action. `neutral` returns the candidate to the local deterministic gate, which still revalidates it immediately before moving anything. The model has no filesystem or process tools.

A live synthetic smoke test completed successfully with the configured Luna/medium setup. The supplied API key was used only in that temporary test process and was **not** written into the repository, installer, build output, or tracked files.

### Local credential setup

Create an ignored `.env.local` next to `package.json`:

```dotenv
OPENAI_API_KEY=your_local_key
LIFEGUARD_REASONING_MODEL=gpt-5.6-luna
LIFEGUARD_REASONING_EFFORT=medium
```

Then verify it without using real machine data:

```powershell
pnpm reasoning:check
```

Never commit `.env.local`. The application remains fully functional with the deterministic safety policy when no key is installed.

## Build and test commands

```powershell
pnpm install --frozen-lockfile
pnpm audit:backend
pnpm audit --audit-level high
.\scripts\verify-native.ps1
pnpm dist
```

`verify-native.ps1` packages the app and validates all of the following against Lifeguard-owned fixtures only:

- fixed-drive discovery
- duplicate quarantine
- stale-temp quarantine
- graceful memory-worker shutdown
- restoration
- duplicate and temp coverage
- SHA-256 integrity
- fixture-only mutation
- remaining recoverable item

The final Windows validation passed all checks. The dependency audit reported no known vulnerabilities after upgrading Electron to 44.3.0.

## macOS handoff

On a physical Mac:

```bash
git pull
pnpm install
cp .env.example .env.local
# add a local key if testing reasoning
pnpm reasoning:check
bash scripts/verify-mac.sh
```

Read [MAC_TESTING.md](MAC_TESTING.md) before recording evidence. A passing Mac run is required before saying the MVP has been physically validated on macOS. The app fails closed when Accessibility permission is unavailable, so it will not close a real Mac app without that permission.

## Video

The committed MP4 is 14.5 seconds, below the 15-second request. It is a real capture of the packaged Windows app running the isolated autonomous demo. The frame is cropped above the local activity details to avoid showing user file paths.

For a new capture:

```powershell
.\dist\win-unpacked\Lifeguard.exe --lifeguard-video-demo
```

The flag is demo-only: it disables GPU rendering for recorder compatibility, maximizes the app, stages fixtures after launch, and changes no normal-launch behavior.

## Architecture map

| Area | Main implementation |
| --- | --- |
| OS observation and fixed-drive discovery | `src/main/observer.ts` |
| Incremental scan and duplicate detection | `src/main/storage-indexer.ts` |
| Deterministic safety/path policy | `src/main/path-policy.ts` |
| Autonomous actions and recovery ledger | `src/main/agent.ts` |
| Action-time file identity checks | `src/main/candidate-identity.ts` |
| OpenAI privacy-bounded reasoner | `src/main/reasoning.ts`, `reasoning-client.ts` |
| Electron startup, tray, security, and IPC | `src/main/index.ts`, `src/preload/index.ts` |
| Persistent local state | `src/main/store.ts` |
| Windows/macOS native verifiers | `scripts/verify-native.ps1`, `scripts/verify-mac.sh` |

## Remaining work and honest caveats

### Core product decision: capacity reclamation

The current action is **recoverable isolation**, not a claim that same-volume disk capacity was freed. A rename into quarantine on the same disk does not increase free-space bytes. Do not market it as “freeing storage” yet.

Choose one future policy before making that claim:

1. Purge verified cache/temp items and reverified exact duplicates after a stated retention period.
2. Compress quarantined objects and report only physical bytes actually saved.
3. Add a provider-specific cloud adapter that proves remote sync before dehydration.

This is a backend/product-policy decision, not a frontend wording fix.

### External release gates

- Run the physical Mac suite and record its evidence.
- Add a Windows code-signing certificate and Apple signing/notarization credentials for a public distribution release.
- Add an application icon before final visual polish; the builder currently reports use of its default icon.
- For millions of scanned files or long-running testing, consider migrating the JSON state store to SQLite.

### Frontend refinement ideas

- Keep all language accurate: use **isolated**, **recoverable**, or **held safely**, never “freed” or “storage saved” until a capacity-reclamation policy exists.
- Show `READY` only after a model-backed assessment; show a clear local-only state otherwise.
- Keep the dashboard as an audit surface rather than an approval inbox; autonomy is the interaction.
- Use the existing demo button and the short MP4 as the two-minute-video opening proof point.

## Submission framing

Use this concise description:

> Lifeguard is an always-running Windows and macOS agent that lives in the desktop environment. It learns from real drive layout, protected projects, file age, foreground context, memory pressure, and recovery history to quietly isolate high-confidence waste and close only idle, restartable apps under pressure. Every action is hash-verified and recoverable, while an optional privacy-bounded reasoner can only add protection.

The hackathon differentiator is not a chat window asking users what to clean. The agent operates where its context exists—the desktop filesystem, running applications, RAM state, and system tray—and the user audits completed, reversible actions afterward.
