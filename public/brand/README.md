# Droproom Brand Asset Notes

Current primary app icon asset used by `components/DroproomApp.tsx`:

- `droproom-premium-hero.png`

Secondary experiment kept for visual reference:

- `droproom-premium-hero1.png`

Small future asset guidance:

- Keep hero/drop previews square-first at `1024 x 1024`, with the central subject safe inside the middle 78%.
- For GIF or motion previews, export a lightweight poster still next to the animated asset so the CSS media-safe frames have a clean fallback.
- Prefer transparent PNG or WebP for icon-like art, and keep looping GIF/WebP motion under 3 seconds with no hard flash frames.
- Avoid changing the filenames above unless the app constants are updated in the same branch.
