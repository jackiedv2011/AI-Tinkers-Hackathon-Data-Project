# Product decisions

## Desktop only

Lifeguard supports Windows and macOS. It does not claim to run on iPhone or manage iOS resources. The product's value depends on operating-system access to a named project folder, foreground application, processes, and local storage - context that iOS does not provide to third-party apps.

## Safety before breadth

The desktop agent acts only on a user-approved folder and user-approved process. Quarantine is reversible, protected workspaces are excluded, and the deterministic policy engine is the only authority allowed to make an action decision.
