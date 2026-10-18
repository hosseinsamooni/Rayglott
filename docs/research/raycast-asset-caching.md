# Raycast asset caching: why a replaced extension icon doesn't appear and how to force a reload

Research for Rayglott (issue #11 in the repo's issue tracker; part of map #10). Sources are the Raycast developer changelog, the `raycast/extensions` issue tracker (#1095), and the installed Raycast app's frontend asset-loading code.

## Summary

- **Why it happens**: Raycast caches bundled assets by their **path/filename** (resolved to an `ipc://image?...&v=<version>` URL), not by content hash. Replacing the bytes of `assets/rayglott-icon.png` leaves the cache key unchanged, so Raycast keeps serving the stale image.
- **Dev mode**: the **"Clear Assets Cache"** developer action (added in Raycast 1.31.0, 2022-03-23) is the intended fix and is usually enough for list/item icons. It is **not reliably effective for every asset/version** (users reported it failing as late as 2025, issue #1095), so a **full Raycast restart** remains the guaranteed fallback.
- **Installed extension**: since 1.31.0 a Store update clears the extension's **icon** cache, but the changelog explicitly warns that **other dynamically loaded assets in `assets/` may still be cached**; to force those to update for end users you must **rename** the file.
- **Robust recommendation**: treat a filename change as the primary cache-bust mechanism (it changes the cache key outright) and keep "Clear Assets Cache → restart Raycast" as the documented dev-time recovery. Do not rely on content hashing or on "Clear Assets Cache" alone.

## 1. Observed behavior (issue #1095)

- Raycast version 1.30.2 (2022): assets/icons were not reloaded on-the-fly in dev mode or after a rebuild. The only reliable recovery was quitting and restarting Raycast entirely.
- Raycast's response (1.31.0): added a developer action to clear the local assets cache "e.g. to render an updated list icon without having to restart Raycast", plus fixes for "the extension icon not being updated during development" and "an extension's cached icon not being cleared when updated from the store."
- The changelog's caveat for the store case: "other dynamically loaded images in the assets folder may still be cached, so if you want to enforce an update for end users you need to rename them."

## 2. How the cache key is formed

Evidence from the current Raycast build (`ipc-icon-cache-version-*.js`):

- Assets are served through an internal `ipc://image` URL carrying a `path` query parameter.
- Each asset URL also carries a version parameter `v`, computed as a **global** `IpcIconCacheVersion` plus a **per-path** counter (`IpcPerPathIconVersions[path]`).
- `c(paths)` increments the per-path counter for the given paths, which is what "Clear Assets Cache" effectively triggers; `u(url)` rewrites an asset URL with the current `v`.
- There is **no content hash** in this scheme: the key is `(path, globalVersion + perPathVersion)`. Replacing file contents at the same path does not change either component, so the stale entry is reused. Renaming the file changes `path`, which starts a fresh counter bucket and forces a reload.

Consequence: cache invalidation is **path-based**, not content-based. Renaming is a guaranteed cache-bust; in-place replacement is not.

## 3. Reliability of each method

| Method | Dev mode | Installed extension | Robust across versions? |
|---|---|---|---|
| In-place file replacement + rebuild | No (stale) | No (stale) | No |
| "Clear Assets Cache" dev action | Usually yes for list/item icons; reported unreliable for some assets (2024–2025) | Not available to end users | Partial |
| Full Raycast restart (Quit Raycast) | Yes (issue #1095 step 8) | Yes, but not a user-facing instruction | Yes, but heavy |
| Rename the asset (cache-bust) | Yes (new path → new cache key) | Yes (new path ships to users) | Yes |

Notes:
- The extension's **top-level icon** (`package.json` `icon`) is treated specially: Raycast fixed clearing it on dev change (1.31.0) and on Store update (1.31.0). Even so, renaming is the only mechanism that is both deterministic and version-independent.
- The "Clear Assets Cache" action is a developer-only affordance; installed users cannot trigger it, so it cannot be part of a shipping fix.

## 4. Concrete recommendation for Rayglott

1. **Cache-bust by renaming** whenever an asset's pixels change. For the Candidate A swap already made in ticket #8, bump the extension icon filename instead of overwriting it in place, e.g. `assets/rayglott-icon.png` → `assets/rayglott-icon-v2.png`, and update `package.json` `"icon": "rayglott-icon-v2.png"`. Apply the same rule to any future menu-bar assets (tickets #12): include a revision token in the filename and rename on every pixel change.
2. **Keep `@dark` variants in lockstep** if adopted (ticket #12/parent #10): rename both `*-v2.png` and `*-v2@dark.png` together so neither variant stays stale.
3. **Dev workflow** (document in README, FA + EN): rebuild, then run Raycast's **Clear Assets Cache** developer action; if the icon is still stale, quit and restart Raycast ("Quit Raycast" command) before re-running `ray develop`. Do not assume a rebuild alone refreshes the icon.
4. **Do not rely on content hashing** or on "Clear Assets Cache" alone, and do not instruct end users to clear caches or restart Raycast for an icon update — the rename ships the new asset transparently.

## 5. Implications for dependent tickets

- Ticket #14 (cache-bust strategy choice): choose **rename + documented dev steps** (not Clear Assets Cache alone, not restart alone). Recommended filename token: `v2` (or a date/revision), applied to `rayglott-icon` and to any Candidate A menu-bar assets.
- Ticket #12 (menu-bar assets): because menu-bar icons are assets too, the same rename-on-change rule applies; prefer filenames that already encode state (`rayglott-menubar-active-v2.png`, `...-paused-v2.png`) so future revisions are unambiguous.
- Ticket #13 (notifications): unaffected by caching; no icon asset change required.

## Sources

- `raycast/extensions` issue #1095 — "Assets are not reloaded until Raycast is restarted" (2022-03-13), closed 2022-03-24; 2024/2025 comments reporting "Clear Assets Cache" not working.
- Raycast developer changelog 1.31.0 (2022-03-23): "Dev Tools: added a new development action to clear the local assets cache…"; "Fixed the extension icon not being updated during development."; "Fixed an extension's cached icon not being cleared when updated from the store. (Note that other dynamically loaded images in the assets folder may still be cached, so if you want to enforce an update for end users you need to rename them.)"
- Installed Raycast frontend `ipc-icon-cache-version-*.js`: `IpcIconCacheVersion` (global) + `IpcPerPathIconVersions[path]` (per path) combined into the `v` query parameter of `ipc://image` URLs; `c(paths)` increments per-path counters. No content hash is used.