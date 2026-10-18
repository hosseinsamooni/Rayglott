# Raycast extension icon requirements and menu-bar conventions

Research for Rayglott (issue #2 in the repo's issue tracker; the wayfinder ticket was filed as #3). Sources are the Raycast developer docs, manifest docs, changelog, and macOS HIG material.

## Summary

- **Extension (store) icon**: PNG, **512×512 px**, referenced from `package.json` `icon`. Light/dark via `@dark` suffix (`icon.png` + `icon@dark.png`) or an explicit `{ light, dark }` object. The default Raycast icon is rejected for Store submission. Raycast ships an Icon Maker and a template to produce compliant icons.
- **Command icons**: PNG, **at least 512×512 px**, same `@dark` convention; if omitted, the extension icon is used.
- **MenuBarExtra icon**: an `Image.ImageLike` — built-in `Icon`, a bundled asset (PNG or SVG), a remote URL, a file icon, or an emoji. Raycast renders it in the macOS menu bar; macOS has final say on whether it is displayed.
- **Small-size rendering**: the menu bar working area is fixed at ~22 pt; a 16×16 pt (32×32 px @2x) glyph matches the weight of system items. Assets can be other sizes as long as they are not taller than 22 pt, but small, crisp artwork is required.
- **Dark/light**: `@dark` suffix assets and automatic detection; since Raycast 1.76/1.79, menu-bar icon tinting follows the **system** (menu bar) appearance, not Raycast's. Tinting with `Color.PrimaryText`/`Color.SecondaryText` adapts automatically.
- **Template vs. full color**: macOS menu bar extras may be full color or monochrome **template** images. Template images are preferred because macOS tints them automatically for light/dark. If an icon is a template, **color is ignored and only alpha is used**, so a colored badge/dot will not retain its color.
- **Active vs. paused**: Raycast does not require distinct icons. A single glyph with a color badge is acceptable *only if* it is shipped as a full-color (non-template) asset or state is conveyed via `tintColor`. Otherwise prefer distinct monochrome glyphs or a tint-color change. The repo's current code already uses distinct built-in icons (`Icon.Keyboard` vs `Icon.Pause`) plus a title, which is the safe, conventional choice.

## 1. Extension (store) icon

Source: `developers.raycast.com/information/manifest` and `developers.raycast.com/basics/prepare-an-extension-for-store`.

- `icon` in `package.json` is a reference to a file in the `assets/` folder.
- **Format: PNG**, size **512×512 px** for the extension icon.
- Must look good in both light and dark themes (theme switchable in Raycast Preferences → Appearance).
- Separate light/dark icons: `@dark` suffix, e.g. `icon.png` and `icon@dark.png`, or an explicit object `{ "light": ..., "dark": ... }`.
- Extensions using the default Raycast icon are rejected by the Store.
- Raycast provides an Icon Maker (icon.ray.so) and an icon template to help.

Transparency: PNG alpha is supported; no explicit prohibition. Store icons are typically opaque rounded-square artwork (Raycast's icon template). Alpha is fine for non-rectangular glyphs but the icon should read at small sizes in the Raycast root search.

## 2. Command icons

Source: manifest docs.

- Optional `icon` per command in `package.json` `commands[]`.
- PNG, **at least 512×512 px**.
- Same `@dark` light/dark convention; if omitted, the extension icon is used.

Rayglott's `menubar` and `toggle` commands currently omit `icon`, so they inherit `rayglott-icon.png`.

## 3. MenuBarExtra icon

Source: `developers.raycast.com/api-reference/menu-bar-commands` and `developers.raycast.com/api-reference/user-interface/icons-and-images`.

- Prop: `icon: Image.ImageLike`.
- `Image.ImageLike` accepts: a URL string, an asset file name (PNG/SVG), a built-in `Icon`, a `FileIcon`, an `Image` object, or an emoji.
- Asset references resolve from `assets/`; `@dark` suffix provides theme-aware variants.
- `Image` supports `mask` (Circle/RoundedRectangle) and `tintColor` (a `Color.ColorLike`, including dynamic `{ light, dark }`).
- Raycast detects the menu bar's dark/light mode; menu-bar icon tinting follows the **system** appearance (fixed in 1.58.0 and improved in 1.76.0/1.79.0).

SVG support: Raycast added SVG rendering (changelog 1.52.0: "SVG: You can now use the Raycast Color in an SVG") and `@dark` asset suffixes (1.58.0), so SVG assets are valid for menu-bar icons, including color.

## 4. Small-size rendering

Source: macOS HIG via bjango.com "Designing macOS menu bar extras" (cited as general macOS convention; Raycast delegates to macOS).

- Menu bar height is 24 pt (Big Sur+); the working area for extras is fixed at **22 pt**; items cannot be taller.
- A **16×16 pt** glyph (32×32 px @2x) matches the visual weight of system menu bar items.
- Assets may be other sizes provided they are not taller than 22 pt, but they must stay crisp at 1x/2x.
- Full-color or monochrome template images are both allowed by macOS; **template images are preferred** because macOS tints them automatically for light/dark mode without separate assets.

Raycast does not publish a stricter pixel spec for menu-bar icons; the safe target is a 16×16 pt (32×32 px) monochrome template glyph with transparent background, or a 22 pt-tall full-color asset.

## 5. Active vs. paused state indication

Raycast imposes no requirement to use distinct icons; `icon` can be swapped at runtime based on state, and `tintColor` can change.

Critical rendering caveat: if the icon is treated as a **template image**, macOS ignores color and uses only the alpha channel. Therefore:

- A **single glyph with a colored badge/dot will not show color** in the menu bar unless it is rendered as a full-color (original-mode) image, or the state color is applied via `tintColor` to the whole glyph.
- `tintColor` on an asset tints all non-transparent pixels, so a monochrome glyph tinted `Color.Green`/`Color.Red` (or `Color.PrimaryText`) is a reliable, theme-aware state signal.
- Color adjustment: Raycast adjusts tint colors for contrast by default; set `adjustContrast: false` only if exact color reproduction matters.

Practical recommendation for Rayglott:
- Keep the decided "ABC keycap" glyph as the base artwork.
- If the active/paused distinction must be colored (badge/dot), ship two full-color PNG/SVG variants and accept that they will not auto-tint to the menu bar's appearance (risk: poor contrast on some wallpapers). Prefer a monochrome glyph whose `tintColor` flips between a neutral (active) and a muted/colored (paused) value, or use two distinct monochrome glyphs (the current `Icon.Keyboard` / `Icon.Pause` approach), which is the conventional, lowest-risk option.
- Keep the text title ("ABC" / "FA/EN") as the redundant state cue, as the current code does.

## 6. Implications for Rayglott

- `assets/rayglott-icon.png` must be 512×512 PNG (currently referenced; verify dimensions). Add `rayglott-icon@dark.png` if a dark variant is desired.
- The `menubar` command may keep using built-in icons, or switch to a bundled 16×16 pt (32×32 px) asset for a custom "ABC" keycap. If a colored badge is required, use full-color assets or `tintColor`, not a template.
- No permission or reliability concerns arise from icon choice; this ticket is purely asset/convention guidance.

## Sources

- Raycast manifest docs — https://developers.raycast.com/information/manifest
- Prepare an extension for Store — https://developers.raycast.com/basics/prepare-an-extension-for-store
- Icons & Images API — https://developers.raycast.com/api-reference/user-interface/icons-and-images
- Menu Bar Commands API — https://developers.raycast.com/api-reference/menu-bar-commands
- Colors API — https://developers.raycast.com/api-reference/user-interface/colors
- Raycast extensions changelog (SVG, @dark suffix, menu-bar tinting) — https://github.com/raycast/extensions/blob/main/docs/changelog.md
- macOS menu bar extras design — https://bjango.com/articles/designingmenubarextras
- Raycast Icon Maker — https://icon.ray.so
