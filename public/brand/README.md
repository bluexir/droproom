# Droproom Brand Asset Notes

Canonical product assets served from `/brand`:

- `logo.png` - app icon and apple touch icon source.
- `hero.png` - primary product hero artwork.
- `og.png` - Open Graph and Twitter preview image.
- `splash.png` - tall splash/social artwork.

These files are copied from the repository root assets of the same names:

- `logo.png`
- `hero.png`
- `og.png`
- `splash.png`

Do not use `droproom-premium-hero.png` or `droproom-premium-hero1.png` for product metadata or new product surfaces. They remain in this folder only as legacy assets.

Small future asset guidance:

- Keep hero/drop previews square-first at `1024 x 1024`, with the central subject safe inside the middle 78%.
- For GIF or motion previews, export a lightweight poster still next to the animated asset so the CSS media-safe frames have a clean fallback.
- Prefer transparent PNG or WebP for icon-like art, and keep looping GIF/WebP motion under 3 seconds with no hard flash frames.
- Avoid changing the canonical filenames above unless metadata and app constants are updated in the same branch.
