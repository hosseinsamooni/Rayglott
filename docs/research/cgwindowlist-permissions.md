# Research: CGWindowList window detection — permissions and reliability on modern macOS

**Ticket:** #2 (wayfinder research). **Repo:** hosseinsamooni/Rayglott (Swift daemon `assets/watcher.swift`).
**Question:** Does `CGWindowListCopyWindowInfo` require Screen Recording permission on modern macOS, and how reliable are the current heuristics (`ownerName == "Raycast"`, `layer > 0`, `height > 40`)? Are there more reliable signals for "Raycast main window is visible" (AX, process activation, window level)? Surface permission/reliability risks the daemon refactor must handle.

## Bottom line

1. **Permission: yes, effectively.** On macOS 10.15+, `CGWindowListCopyWindowInfo` is affected by the Screen Recording TCC permission. The call itself does not prompt and still returns a list, but which fields are populated is gated: `kCGWindowName` (title) is always withheld without permission, and on macOS 15 (Tahoe) `kCGWindowOwnerName` is also withheld for windows owned by *other* processes. The current daemon matches on `ownerName == "Raycast"`, so on Tahoe **without Screen Recording permission the Raycast window is never detected and auto-switch silently stops working.** On macOS 26.5 (Golden Gate) Apple changed this so owner names are populated even without permission — behavior is OS-version-dependent and undocumented.
2. **Heuristics are weak and over-broad.** `layer > 0` catches every floating Raycast surface (launcher, Floating Notes, panels), not just the main window, and misses the AI Chat window (layer 0). `height > 40` filters almost nothing. Detection therefore fires on Notes/panels (false positives) and is permission-fragile.
3. **Process activation is not a usable signal.** Raycast is a launcher overlay: while it is open, `NSWorkspace.frontmostApplication` does not change (verified on macOS 26.5 for Spotlight/Raycast/Alfred). Do not key visibility off activation.
4. **More reliable signals exist:** tighten CGWindowList to the launcher's actual layer (8), on-screen + alpha, and minimum size; and/or use the Accessibility API (`AXUIElement` on the Raycast process, subrole `AXSystemDialog`/`AXFloatingWindow`, not minimized). AX requires Accessibility permission for the daemon but avoids Screen Recording gating and is the same permission family Raycast's own features already use.
5. **TCC is per-executable.** The daemon is an unsigned, ad-hoc-signed `swiftc` binary in Raycast's support path. Screen Recording / Accessibility grants are keyed to that executable's path+signature, so a recompile (new ad-hoc signature) or path change silently invalidates the grant. This is a latent, hard-to-debug failure mode.

## Permission landscape

- macOS Catalina introduced Screen Recording (TCC service `kTCCServiceScreenCapture`) gating for screen-capture APIs. `CGWindowListCopyWindowInfo` does not prompt, but returns *limited* metadata without permission: titles withheld, sharing state zeroed. (Ryan Thomson, "Screen Recording Permissions in Catalina are a Mess", 2020-01-31; Apple WWDC 2019 "Advances in macOS Security".)
- Documented permission APIs: `CGPreflightScreenCaptureAccess()` (check, no prompt) and `CGRequestScreenCaptureAccess()` (prompt). Available macOS 10.15+ (link cleanly on 11.0+; Chromium restricts to 11.0 for link reasons). Use these instead of inferring permission from which keys are nil. (Apple Developer Documentation; Chromium `ui/base/cocoa/permissions_utils.mm`.)
- On macOS 15 (Tahoe): without Screen Recording permission, `kCGWindowOwnerName` is `nil` for windows owned by other processes. With permission, populated. (Apple Developer Forums thread 839069, "CGWindowListCopyWindowInfo returns…", 2025.)
- On macOS 26.5 (Golden Gate / "Tahoe" follow-up): even without permission, `kCGWindowOwnerName` is populated for other processes. Apple explicitly warns that relying on nil-vs-populated is *undocumented* and may change at any time; use `CGPreflightScreenCaptureAccess()` for the permission state. (Same forum thread.)
- ScreenCaptureKit (`SCShareableContent`) is the modern replacement surface but is *also* gated by Screen Recording permission and requires an app restart after granting. It does not remove the permission requirement. (Apple "Capturing screen content in macOS"; WWDC22 10156.)
- Raycast itself requires Screen Recording for Window Management and Accessibility for hotkeys/window management (Raycast Manual, Troubleshooting/Permissions). Users are therefore already familiar with granting these — but to *Raycast*, not to the daemon binary.

## Current heuristics in `assets/watcher.swift`

```swift
if let ownerName = window[kCGWindowOwnerName as String] as? String,
   ownerName == "Raycast",
   let layer = window[kCGWindowLayer as String] as? Int,
   layer > 0 {          // filters menu-bar icon + hidden processes
    if let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
       let height = bounds["Height"], height > 40 {
        return true
    }
}
```

Weaknesses:
- **`ownerName == "Raycast"`** is permission-gated on Tahoe (nil without Screen Recording) → silent false negatives. Also assumes Raycast's process display name never changes (localization/branding risk, low).
- **`layer > 0`** is too coarse: Raycast's Floating Notes and panels are also layer 8 (see below), so detection is true while only Notes is open → unwanted input-source switch. Conversely the AI Chat window is layer 0, so it is *missed* even when visible.
- **`height > 40`** excludes almost nothing; Raycast's launcher is far taller than 40 and so are many panels.
- No use of `kCGWindowIsOnscreen`, `kCGWindowAlpha`, bounds width, or window number/title.

Empirical window levels (Keyboard Maestro community, Raycast window detection):
- Launcher: layer 8.
- Floating Notes: layer 8.
- AI Chat: layer 0.
So "main window visible" cannot be inferred from `layer > 0` alone; the launcher is specifically layer 8.

## More reliable signals

### A. Tightened CGWindowList (still Screen-Recording-gated for owner name)

Match `ownerName == "Raycast"` AND `layer == 8` AND `isOnscreen == true` AND `alpha > 0` AND bounds height/width above the launcher's minimum (e.g. height ≥ 100, width ≥ 300). This removes Notes-vs-launcher ambiguity only partially (Notes is also layer 8), so combine with size thresholds or with AX. Also read `kCGWindowSharingState`/title only if permission granted.

### B. Accessibility (AX) — recommended primary signal if permission is granted

- Raycast is an accessory/launcher app; its windows are `NSPanel`s whose AX subrole is `AXSystemDialog` (not `AXFloatingWindow`) — same pattern Grid fixed (commit b608169). Enumerate via `AXUIElementCreateApplication(pid)` → `kAXWindowsAttribute`, filter subrole ∈ {`AXStandardWindow`, `AXFloatingWindow`, `AXSystemDialog`}, `kAXMinimizedAttribute == false`, and window not hidden.
- AX does not depend on Screen Recording permission; it requires Accessibility permission, which is the same family Raycast's own Window Management/Screen Awareness use and which users already grant to Raycast.
- Caveat: requires the daemon binary itself to hold Accessibility permission (per-executable TCC). And AX enumeration is slower than CGWindowList; keep the 150 ms poll but make AX calls bounded.
- `kAXFocusedUIElementAttribute` / system-wide focused element can attribute keyboard ownership to Raycast even though `NSWorkspace.frontmostApplication` does not change (LockIME finding on macOS 26.5). This is the most semantically correct "Raycast is the active input target" signal, but requires an `AXObserver` and Accessibility permission.

### C. Process activation — NOT reliable

`NSWorkspace.shared.frontmostApplication` / `NSRunningApplication.isActive` do not change when a launcher overlay (Spotlight/Raycast/Alfred/LaunchBar) takes focus (verified macOS 26.5, LockIME). Do not use as the visibility trigger. It can only be a secondary "Raycast became frontmost" hint in the rare cases where it does flip.

### D. Window level / layer

Raycast launcher uses window level corresponding to layer 8. Useful as a CG-side discriminator but version-dependent (Raycast can change panel level across releases). Treat as a heuristic, not an invariant; prefer AX subrole where possible.

### E. Modern replacement (ScreenCaptureKit)

`SCShareableContent` (macOS 12.3+) exposes `SCWindow` with title, on-screen flag, owning app, and windowID, but is gated by Screen Recording permission and triggers the prompt + restart-after-grant. It does not solve the permission problem and adds a restart requirement. Not recommended for a lightweight poller.

## Risks to surface in the refactor

1. **Permission denial = silent no-op.** Without Screen Recording, current detection fails on Tahoe. Mitigation: preflight with `CGPreflightScreenCaptureAccess()` at daemon start; if false, either prompt via `CGRequestScreenCaptureAccess()` or switch to AX path; never silently poll and always report "no permission" state to the TS side through the state file.
2. **Restart-after-grant.** macOS requires quitting/reopening the app after granting Screen Recording. The daemon (launched detached) must be restarted after the grant; document this.
3. **Per-executable TCC + ad-hoc signing.** The `swiftc` binary is ad-hoc signed; recompiling changes the signature and invalidates TCC grants. Mitigation: compile once, cache the binary, avoid recompiling on every run; or sign with a stable identity; or move detection in-process into a Raycast command (not feasible for a background daemon). Document that users may need to re-grant after updates.
4. **Unsigned CLI TCC UX.** A bare command-line binary may not surface the standard permission prompt reliably; users may need to add it manually in System Settings → Privacy & Security. Consider a signed helper or an onboarding step.
5. **False positives from `layer > 0`.** Switching input source while Floating Notes is open is wrong. Tighten to layer 8 + size + on-screen, and ideally AX subrole.
6. **False negatives for AI Chat.** AI Chat is layer 0; if the product intent is "any Raycast surface", the current heuristic already misses it; if intent is "launcher only", document that. Align with desired behavior.
7. **Polling cost and races.** 150 ms poll + TCC/AX calls; AX enumeration is slower. Keep calls bounded and cache the Raycast PID.
8. **OS-version drift.** Owner-name gating changed between Tahoe and Golden Gate; layer values and AX subroles can change across Raycast releases. Build detection as a layered strategy (AX first if permitted, CGWindowList fallback) with per-signal logging, and make thresholds configurable rather than hardcoded.
9. **macOS 26/27 naming.** System Settings → Privacy & Security → "Screen Recording" (renamed "Device Control and Data Access" for Accessibility on macOS 27 per Raycast docs). Onboarding text must track OS version.

## Recommendations for the refactor

1. **Preflight + state channel:** daemon writes a JSON state file (already decided) including `screenRecordingGranted`, `accessibilityGranted`, and `raycastVisible`. TS reads it; surfaces actionable errors when a permission is missing.
2. **Layered detection:** try AX (Accessibility) first when granted; fall back to CGWindowList with tightened heuristics (layer 8, on-screen, alpha > 0, min size) when Screen Recording is granted; if neither permission is granted, report degraded and do not guess.
3. **Never use process activation** as the trigger.
4. **Tighten heuristics** from `layer > 0` to launcher-specific criteria; do not switch on Floating Notes/AI Chat unless intended.
5. **Prompt + guide:** call `CGRequestScreenCaptureAccess()` / `AXIsProcessTrustedWithOptions` prompt at first run; print/return a clear message naming the exact System Settings pane.
6. **Stable binary:** cache the compiled binary; document re-grant after recompile; consider a fixed install path.
7. **Logging:** log which signal fired and permission state to aid debugging (currently silent).

## Sources

- Apple Developer Forums, "CGWindowListCopyWindowInfo returns…" (thread 839069): owner-name gating on Tahoe vs Golden Gate; undocumented; use `CGPreflightScreenCaptureAccess()` / `CGRequestScreenCaptureAccess()`; `SCShareableContent` as modern surface. https://developer.apple.com/forums/thread/839069
- Apple Developer Documentation: `CGPreflightScreenCaptureAccess()`, `CGRequestScreenCaptureAccess()`, ScreenCaptureKit `SCShareableContent`. https://developer.apple.com/documentation/coregraphics/cgpreflightscreencaptureaccess() ; https://developer.apple.com/documentation/screencapturekit/scshareablecontent
- Ryan Thomson, "Screen Recording Permissions in Catalina are a Mess" (2020-01-31): CGWindowListCopyWindowInfo is affected; `kCGWindowName` withheld without permission; `kCGWindowSharingState` zeroed. https://www.ryanthomson.net/articles/screen-recording-permissions-catalina-mess/
- Stack Overflow: "Enabling Screen-Recording API in Catalina (kCGWindowName)" — `CGRequestScreenCaptureAccess`, heuristic detection. https://stackoverflow.com/questions/59337022/
- Stack Overflow: "Detecting screen recording settings on macOS Catalina" — chockenberry heuristic; SystemUIServer window-name heuristic. https://stackoverflow.com/questions/56597221/
- Chromium, `ui/base/cocoa/permissions_utils.mm` — `IsScreenCaptureAllowed` using CGWindowList on 10.15 and `CGPreflightScreenCaptureAccess` on 11.0+. https://chromium.googlesource.com/chromium/src/+/8d2f8fe1c62ad62f568f0dc1f56f0bbfaa1e3e28/ui/base/cocoa/permissions_utils.mm
- Keyboard Maestro community: Raycast window detection via CGWindowList — launcher layer 8, Floating Notes layer 8, AI Chat layer 0; window numbers per-session-stable anecdote. https://community.folivora.ai/t/active-window-title-conditional-not-working/41771
- LockIME PR "feat(lock): detect Spotlight and launcher overlays for rules" — `frontmostApplication` does not change for Spotlight/Raycast; AX is the only reliable signal on macOS 26.5; CGWindowList does not expose redesigned Spotlight window. https://github.com/oomol-lab/LockIME/pull/11
- Grid commit b608169 — NSPanel reports subrole `AXSystemDialog`; floating panels use CGWindowList layer 3 (not 0); accept layers 0–19 and `AXSystemDialog`. https://github.com/pom11/Grid/commit/b6081698c69c67e942f86739a0727be6839838a0
- AltTab (lwouis/alt-tab-macos) DeepWiki — combined CGWindow + AX discovery; AX observer notifications. https://deepwiki.com/lwouis/alt-tab-macos/2.2-window-discovery-and-tracking
- Raycast Manual — Window Management/Switch Windows require Accessibility; Screen Recording for window screenshots; macOS 26 menu-bar allow-list; macOS 27 "Device Control and Data Access" rename. https://manual.raycast.com/window-management ; https://manual.raycast.com/navigation ; https://manual.raycast.com/troubleshooting.md
- Raycast API Security docs — extensions inherit Raycast's permissions; screen recording gated. https://developers.raycast.com/information/security
- mediar-ai note (lachesis issue 18) — AXUIElement approach for focused window needs Accessibility, not Screen Recording; Electron apps report empty titles via AX, fallback to CGWindowList (Screen Recording). https://github.com/ibra/lachesis/issues/18
- Swift/macOS screen capture reference — `SCShareableContent` triggers Screen Recording prompt + restart. https://github.com/tenequm/skills/blob/main/skills/swift-macos/references/screen-capture-audio.md
