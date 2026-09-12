# Headroom presentation contract

Source of truth inspected before implementation: `tinkerers/website/index.html`, `styles.css`, `headroom.css`, `brand.css`, `ecosystem.css`, and `js/main.js`, plus the running website at localhost:4174.

## Actual website design system

- Geist, regular 400 display text and 500 controls. System sans fallback. Display tracking −.04 to −.055em; compact navigation −.02em. Hero around 72px, section titles 66px, editorial statements up to 84px; mobile 38–50px. Body 16–24px, line height 1.35–1.5; labels 12–15px.
- Paper #f7f5f3, alternate #f9f7f3, elevated #fcfbfa, ink #0d0d0d, secondary #6e6a69, tertiary #9a9796, borders rgba(13,13,13,.12). The site also uses white section backgrounds.
- Deliberate colored scenes: sage #c0c9ad, terracotta #d56a4e, lilac #cbc2db, blue-gray #d4dce0, sand #e6d2b8. Photographic warmth and soft material lighting belong inside illustrations, rather than on every control.
- Scene corners 12px, interior objects 4–9px; capsule controls 48/56px tall; dialogs 24px radius. Sparse, scene-specific shadows; standard surfaces need no drop shadow.
- Spacing uses 8/16/24/32/40/48/64/80px; editorial sections have 100–170px separation and a 1300px maximum. Desktop app adapts this to 16px gaps, 24–32px panel padding, 40px page gutters.
- Sticky minimal navigation, 24px link gaps, quiet active/hover text. Website menu collapses at 1450px, main layout at 1023/767px; Escape and outside click close the menu.
- Hover 150–200ms; movement 500–1100ms using cubic-bezier(.22,1,.36,1) and cubic-bezier(.215,.61,.355,1). Decorative drift takes 9s. Reduced-motion disables ambient animation and reveals. App actions use 180ms feedback and short opacity/translation transitions.
- Small consistent line icons, typographic h. mark, sparse confidence-building copy, large regular-weight sentences. Colorful floating artifacts surround a stable protected folder; receipts use paper and dashed rules.
- No neon AI gradients, generic admin dashboard, cybersecurity clichés, dense telemetry, giant gauges, gratuitous shadows, or Task Manager aesthetic. Do not label quarantine as physical disk recovery: moving a file on the same volume does not free disk space.

## Existing backend boundary

React renderer → context-isolated `window.lifeguard` preload → Electron IPC → agent/store/observer/storage-indexer. Preserve persisted store names and application ID to retain existing user data.

Existing actions: getState, refresh (runs a policy cycle), updateProfile, chooseProtectedFolder, startStorageScan, restore, stageDemo. Existing state: Profile, action receipts, quarantine, foreground app/PID, free memory, processes, drive capacity, inventory progress. Storage scans fixed drives with hard exclusions; do not claim a selectable approved-folder scan scope exists.

Profile supports protected folders/apps, pre-approved closable apps, age/idle/memory thresholds, learning period and scan budgets. Process actions are graceful close, not suspension, and do not restore prior sessions. The demo creates isolated synthetic files and a worker; it is an explicit action, not automatic preview data.

No remote devices, approval queue, notifications API, or granular permissions API exists. Show this computer only; omit fabricated approvals. Settings may describe local data and actual policy controls.

## Frozen UI contract

Keep all existing API signatures. Add `setWatching(boolean)` for actual pause/resume; `onNavigate(callback)` for native tray navigation; getSettings/updateSettings for real startup preference. Extend state with truthful acting status. No mock bridge in normal browser mode: disconnected mode must identify missing desktop connection and show unavailable metrics.

Home derives protected folder and active app, watching/acting/paused, learning status, free RAM and total drive free space, latest actions, active quarantine count/bytes. Activity displays persisted detail, rule, timestamp and result. Restore uses quarantine IDs only; action log has no reliable foreign key, so file receipts link to Quarantine rather than guessing a restore target. Quarantine exposes path/hash under details and reports restore failures.

Pause stops new policy actions and inventory; an already-started action can finish. Resume preserves rules. The integration will gate policy boundaries and await an in-flight cycle before confirming a completed pause. Monitoring data can still be refreshed while paused.

UI priorities: Home, Activity, Quarantine, native tray; then human-readable Rules and conventional Settings. Devices reflects this local desktop only.

## Build status — September 12, 3:29 PM

All six screens are implemented in the staged app. Home uses the site's locally bundled Geist fonts and existing artwork; no synthetic system data is supplied to the renderer. The recovery ledger has search, per-file restore, original path, timestamp, reason, size, and hash details. Activity has All/Files/Processes/Restores filters. Rules exposes the existing protected-project action and editable process policy. Devices shows this machine's observed drives only. Settings includes actual login preference, local data information, diagnostics, inventory restart, and the existing safe-demo trigger.

Native tray implementation: h. bitmap icon with watching/checking/paused dot states; protected project submenu; pause/resume; two recent receipts; activity and quarantine deep links; Settings; Quit. Tray navigation uses a renderer-ready handshake.

Small backend integration changes: persisted pause gates process and file actions, inventory and demo; pause waits for an in-flight cycle; protected paths are rechecked after hashing; missing foreground context blocks process actions on Windows as well as macOS; unsuccessful restores throw a useful IPC error; failed initial observation does not prevent subsequent monitoring. Observers, storage indexer, store, path policy, and demo implementation files remain byte-for-byte unchanged.

Verification completed: production build, TypeScript checks, all four existing path-policy tests, and isolated Electron integration checks for pause gating, persisted pause/resume, live observation while paused, collision-safe restore, restore receipts, and repeated/missing restore handling. An isolated paused Electron preview rendered real memory/foreground state successfully. The compact Home spacing was built afterward; final visual inspection is still pending.

Not yet applied to the live project. The user requested no desktop interaction while using the computer. The existing project is running in development mode, so saving its source would trigger an automatic app restart. The update is staged separately to honor that request. Remaining: apply staged changes, restart the live app, and verify native tray and final screens once desktop use is authorized.
