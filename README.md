# macOS 26 Icon Studio

A zero-dependency, 100% client-side web studio built specifically for creating modern **macOS 26 (Tahoe) Liquid Glass** application icons that conform to Apple's Human Interface Guidelines.

Drop any image, logo, or legacy icon anywhere on the page, dial in gradients and Liquid Glass specular highlights, preview it live in a macOS 26 Dock and Apps Grid, and export ready-to-use `.icns`, `.iconset.zip`, or `1024×1024` PNG files right in your browser.

---

## Apple macOS 26 HIG Compliance

Every exported icon adheres strictly to Apple's official macOS icon grid:

- **Master Canvas:** `1024 × 1024` px
- **Squircle Keyline:** `824 × 824` px centered with a `100 px` transparent safe margin on all four sides
- **Continuous Curvature:** `185.4 px` (`22.5%`) continuous-corner squircle geometry (no flat circular-arc kinks)
- **Apple HIG Outer Shadow:** `Y +12 px`, `Blur 28 px`, `#000000` at `50%` opacity (+ soft ambient shadow)
- **Liquid Glass Material:** Top-down specular sheen, inner bevel depth, and directional continuous rim highlights
- **System Appearances:** Preview and export **Default**, **Dark**, **Clear Glass**, and **Tinted** variants

---

## Key Features

- **Drop or Paste (`⌘V`) Anywhere:** Drag PNG, SVG, JPG, WebP, or existing icons straight onto the canvas.
- **1-Click "Un-Jail" & "Floating Glyph" Modes:**
  - **Floating Glyph:** Fits your logo inside the `624 × 624` HIG safe zone with tactile 3D elevation.
  - **Full-Bleed Squircle:** Expands artwork edge-to-edge inside the `824 × 824` squircle with Liquid Glass specular edges.
- **Smart Image Helpers:**
  - **Auto-Trim Transparent Padding** to center loose PNGs cleanly.
  - **Extract Gradient from Image** to automatically match the squircle background to your artwork.
  - **Solid Background Remover** (chroma-key alpha removal with adjustable tolerance).
- **Direct On-Canvas Editing:** Drag to move with magnetic center & safe-zone snapping, scroll to zoom, drag handles to scale or rotate, arrow keys to nudge, `⌘Z / ⌘⇧Z` for Undo/Redo.
- **16+ Native Presets & 20 Vector Glyphs:** Start quickly with Tahoe Crystal, Mail Sky, Preview Prism, Clear Glass, Obsidian Metal, and crisp vector symbols or monograms.
- **Real Client-Side Exporters:**
  - **`.icns`** — Native binary Apple Icon container (`icp4` through `ic10`) ready for Finder *Get Info* or `.app` bundles.
  - **`.iconset.zip`** — Complete 10-file Xcode / `iconutil` folder (`icon_16x16.png` to `icon_512x512@2x.png`).
  - **PNG (`1024px` – `16px`)** — High-quality stepped downsampling.

---

## Deploying to GitHub Pages

This project uses plain HTML, CSS, and ES modules with zero build steps and includes `.nojekyll`.

1. Push this repository to GitHub.
2. Open **Settings → Pages** in your GitHub repository.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose `main` and `/ (root)`, and click **Save**.
4. Your macOS 26 Icon Studio will be live at `https://<username>.github.io/<repo>/`.

To run locally during development:

```bash
python3 -m http.server 8123
```

Then open `http://localhost:8123`.
