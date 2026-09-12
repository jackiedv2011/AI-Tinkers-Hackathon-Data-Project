# Product decisions

## Autonomy is the interaction

Lifeguard does not wait for a folder selection and does not produce cleanup recommendations. It starts at login, discovers fixed drives, observes in bounded slices, and takes recoverable action only when deterministic evidence is strong enough. The dashboard is an audit surface, not an approval queue.

## Whole drive does not mean reckless access

Coverage begins at every fixed-volume root, while mutation has a much narrower gate. System and application directories, reparse points, foreground work, protected projects, security tools, sync clients, recent files, and high-importance personal content are hard exclusions. Permission failures are skipped. Ambiguity means no action.

The first real-device session is a 24-hour learning period. The app continuously indexes during that time but does not move files or close apps. The demo bypass is path-scoped to Lifeguard's synthetic app-data directory.

## Bounded reasoning model

The optional OpenAI reasoning layer uses `gpt-5.6-luna` with medium reasoning effort. It receives only anonymous fingerprints and coarse features such as category, extension, size, age, location class, deterministic score, volume count, and restore count. It never receives a raw path, filename, application name, or file content, and API responses are created with `store: false`.

The response schema permits only `protect` and `neutral`. A `protect` assessment vetoes the candidate. `neutral` returns the candidate to the deterministic safety engine, which independently rechecks the path, canonical duplicate, learning window, and quarantine state. The model has no filesystem or process tools and cannot lower the deterministic importance score or authorize an action.

When no key is configured, Lifeguard operates with the deterministic policy alone. If a configured reasoning request fails or is incomplete, its pending candidates remain untouched.

## Recovery before deletion

The MVP never permanently deletes user data. High-confidence waste moves to an app-owned quarantine with its original path, SHA-256 hash, reason, timestamp, size, and restore control. This makes autonomous action demonstrable without making a bad decision irreversible.

## Honest cloud boundary

A local placeholder or a provider directory is not proof of a safe remote copy. Cloud dehydration remains disabled until a provider-specific adapter can verify sync completion through authoritative metadata or an API. Lifeguard also refuses to close cloud-sync clients under memory pressure.

## RAM policy

Lifeguard closes rather than kills. Only known restartable apps with a window, observed idle for 45 minutes, outside the foreground/protected lists, are eligible when free memory falls below the configured threshold. Sync, security, system, and unknown processes are never candidates. The controlled demo worker is the only exception and shuts down through IPC.

## Desktop only

The MVP targets Windows and macOS. There is no phone or iOS companion because the product depends on desktop filesystem, process, foreground-window, and volume context. Windows is packaged and tested in this repository. The macOS observer, fixed-volume adapter, packaging targets, and native verification harness are implemented; the physical-Mac checklist in `docs/MAC_TESTING.md` must pass before the team claims macOS validation.
