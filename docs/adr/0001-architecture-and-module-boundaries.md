# ADR-0001: Architecture and module boundaries for Rayglott

- **Status:** Accepted
- **Date:** 2026-10-18
- **Ticket:** #4 (wayfinder grilling), part of #1
- **Deciders:** maintainer (HITL)

## Context

Rayglott is a macOS-only Raycast extension (Swift daemon + TypeScript commands) that auto-switches the keyboard to ABC when Raycast opens and restores the previous non-English input source when it closes. The current implementation is a single `src/utils.ts`, two command entry points, and one `assets/watcher.swift`, with state carried in a marker file `~/.raycast_auto_abc_paused`. The refactor (ticket #9) needs locked module boundaries, a JSON state contract, observability rules, and daemon lifecycle rules. Research tickets #2 and #3 already established:

- `CGWindowListCopyWindowInfo` owner name is Screen-Recording-gated on macOS 15 (Tahoe); tightened `layer == 8` + on-screen + size is the recommended CG-side heuristic; AX is the more robust but higher-cost option.
- Extension icon is a 512×512 PNG with `@dark` variant; MenuBarExtra icons render at ~16 pt and template images drop color, so active/paused state must use full-color assets or `tintColor`.

Locked this session (map #1): 150 ms polling stays; compile-on-first-run stays with a preflight; state channel is a single JSON state file owned by the daemon that TS reads/writes through; hardcoded ABC/US + restore last non-English; minimal "ABC" keycap icon with badge/dot color; TS unit tests for utils only.

## Decision

### 1. `src/` module boundaries

Raycast requires command entry points at `src/<command>.ts(x)`, so those stay at the root. All logic moves into focused modules:

```
src/
  toggle.ts              # entry: no-view command, showHUD
  menubar.tsx            # entry: MenuBarExtra
  daemon.ts              # lifecycle: preflight, compile, spawn, isRunning, restart, stop
  state.ts               # state-file contract: schema, read, write, atomic
  pause.ts               # pause control: isPaused, setPaused, toggle (uses state + daemon)
```

- `daemon.ts` owns everything about the Swift binary: Xcode CLT / `swiftc` preflight, compile-on-first-run into `environment.supportPath`, single-instance check, detached spawn, restart, stop, and the log path. It exposes `ensureDaemonRunning(): void` (throws on preflight failure) and `isDaemonRunning(): boolean`.
- `state.ts` owns the JSON state file: schema (versioned), read, atomic write, crash recovery. It is the only module that touches the file on disk.
- `pause.ts` is the domain facade used by both commands: `isWatcherPaused`, `setWatcherPaused`, `toggleWatcher`. It ensures the daemon is running (via `daemon.ts`) before mutating state.
- `toggle.ts` / `menubar.tsx` contain only Raycast UI and call `pause.ts`. No direct fs/process access.
- Icon assets live in `assets/`; no TS icon module. Menu bar keeps built-in `Icon.Keyboard` / `Icon.Pause` (safe, conventional); the store icon is the new 512×512 glyph.

### 2. Swift daemon internal structure

Keep a single source file `assets/watcher.swift` (compile-on-first-run stays simple) but split internally into types with `// MARK:` sections:

- `StateFile` — path, schema, atomic read/write, default-on-corrupt recovery.
- `PauseState` — reads the `paused` flag from `StateFile`.
- `WindowDetector` — `isRaycastWindowVisible()` using the tightened CGWindowList heuristic (below).
- `InputSourceController` — `getCurrentInputSourceID`, `selectInputSource`, `switchToABC`.
- `RaycastLanguageWatcher` — orchestrator: timer (150 ms), visibility transitions, save/restore previous non-English source, paused short-circuit.
- `main`/top-level bootstrap — preflight state file, pid, signal handlers, `RunLoop.main.run()`.

Single instance: on bootstrap, if `state.pid` is alive (or a process owns the binary), exit 0. Otherwise write `pid` and continue. On `SIGTERM`/`SIGINT`, clear `pid` (state file retained) and exit.

### 3. State file contract

- **Path:** `~/.rayglott/state.json` (well-known, shared by daemon and TS; both know it without path passing). Directory `~/.rayglott/` created on first use. Legacy marker `~/.raycast_auto_abc_paused` is removed on first run of the new version.
- **Schema (v1):**

  ```json
  {
    "schemaVersion": 1,
    "paused": false,
    "daemonPid": 12345,
    "daemonStartedAt": "2026-10-18T00:00:00Z",
    "lastTransitionAt": null,
    "lastError": null,
    "permission": { "screenRecording": true, "accessibility": false }
  }
  ```

- **Ownership:** the daemon owns the file and is the authoritative writer of `daemonPid`, `daemonStartedAt`, `lastTransitionAt`, `lastError`, `permission`. TS writes **only** `paused` (and may read everything). TS never rewrites daemon-owned fields.
- **Atomic writes:** both sides write to `state.json.tmp` in the same directory then `rename(2)` (atomic on the same filesystem). Never truncate-in-place.
- **Concurrency:** daemon re-reads `paused` every tick (150 ms), so a TS write is picked up within one tick. Races between simultaneous writes are accepted as last-writer-wins on the `paused` field only; daemon-owned fields are never written by TS, so they cannot be clobbered.
- **Crash recovery:** if the file is missing, corrupt, or has an unknown `schemaVersion`, recreate with defaults (`paused` preserved if readable else `false`; `lastError` set to a recovery note). A stale `daemonPid` (process not alive) is cleared on next daemon start.
- **Permissions:** file mode 0600 (contains pid only, but treat as private).

### 4. Error handling / observability

- **Daemon log:** append to `~/.rayglott/daemon.log` (simple append; no rotation in v1). TS log via `console.error` (Raycast captures it).
- **State `lastError`:** daemon writes a human-readable string (or `null`) on preflight/runtime failure; cleared on success. TS reads it for display.
- **HUD (TS commands):** `showHUD` for toggle success/failure and preflight failures (e.g. "❌ Xcode Command Line Tools missing — run `xcode-select --install`").
- **Menu bar:** status item shows active/paused; if `lastError` is non-null, show an additional "⚠️ <error>" item (or set the tooltip). No modal dialogs.
- **Preflight (Xcode CLT / swiftc):** `daemon.ts` checks `xcode-select -p` and `which swiftc` before compiling. On failure, throw a typed error with an actionable message; TS surfaces it via HUD + `lastError`. Never attempt compile without preflight.
- **Permission preflight (Screen Recording):** daemon calls `CGPreflightScreenCaptureAccess()` at start; if false, sets `permission.screenRecording = false` and `lastError` to a message directing the user to System Settings → Privacy & Security → Screen Recording, and (optionally) calls `CGRequestScreenCaptureAccess()` once. Detection is disabled (no silent polling) until granted; TS surfaces the state in the menu bar. Document that macOS requires quitting/reopening after granting and that recompiling the ad-hoc-signed binary invalidates the grant.

### 5. Daemon lifecycle

- **Single instance:** enforced by pid in state file + `pgrep` of the binary path (TS side) and pid liveness check (daemon side).
- **Restart:** `ensureDaemonRunning()` spawns a detached child if no instance is running. On crash, next command/menu-bar refresh respawns.
- **Cleanup:** state file and log persist across runs (paused state survives). Only `daemonPid`/`daemonStartedAt` are cleared on exit. No leftover lock files.
- **Detection heuristic (v1):** tightened CGWindowList — `ownerName == "Raycast"` AND `layer == 8` AND `isOnscreen == true` AND `alpha > 0` AND `width >= 300` AND `height >= 100`. Screen-Recording permission is preflighted (above). AX-based detection is **parked** (out of scope) to keep scope and avoid a second permission family; revisit only if CG detection proves unreliable.

### 6. Icon

- Store icon: replace `assets/rayglott-icon.png` with a 512×512 PNG "ABC" keycap glyph; add `rayglott-icon@dark.png` if a dark variant is needed. Package.json `icon` unchanged unless filenames change.
- Menu bar: Candidate A full-color assets (`A-solid-active.png`/`A-solid-paused.png`, +`@2x`) for active/paused, plus the text title ("ABC"/"FA/EN"). Decided in ticket #12 (supersedes the earlier "built-in icons only" note); colored badge survives only as a non-template asset. No `@dark` variants in v1.

## Consequences

- `src/utils.ts` is split into `daemon.ts`, `state.ts`, `pause.ts`; entry points stay at `src/toggle.ts` and `src/menubar.tsx`.
- State moves from a marker file to a versioned JSON file; one-time migration removes the legacy marker.
- Daemon gains preflight + logging + pid ownership, improving diagnosability at the cost of more Swift code (still a single file).
- Detection remains CG-based and permission-gated, but failure is now explicit rather than a silent no-op.
- TS unit tests (ticket #6) target `pause.ts` and `state.ts` with mocked fs/process; `daemon.ts` preflight logic is testable by injecting command runners.

## Alternatives considered

- **AX as primary detection:** more robust and permission-appropriate, but requires Accessibility permission for the daemon binary and more code. Parked; CG + preflight ships first.
- **Precompiled binary shipping:** avoids compile-on-first-run and TCC invalidation on recompile, but adds distribution/policy complexity. Parked (map #1).
- **Event-driven trigger (AXObserver):** lower latency than 150 ms polling, but higher complexity and permission cost. Parked (map #1).
- **Separate Swift files compiled together:** cleaner, but complicates compile-on-first-run and asset packaging. Single file retained.

## References

- Research #2: `docs/research/cgwindowlist-permissions.md`
- Research #3: `docs/research/raycast-icon-requirements.md`
- Map #1 (decisions so far)
- Tickets #5 (icon glyphs), #6 (TS tests), #7 (preflight), #8 (icon asset), #9 (execution)
