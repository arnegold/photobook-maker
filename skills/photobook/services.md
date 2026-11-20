# Choosing a printing service

Only suggest services that accept our files: PDF upload (best) or full-page images in their online editor.
Prices and offers change all the time: never quote a price from memory. Say "check the price on their site"
or look it up with web search if you can.

## Services the engine has formats for

| service | where | strengths | upload | layflat | format ids |
|---|---|---|---|---|---|
| **Saal Digital** | ships EU, UK, US | real photo paper, layflat as standard, excellent colour; tested with a real 72-page book | PDF, one double page per PDF page | yes (standard) | `saal-21x28` (verified), `saal-28x21`, `saal-30x30`, `saal-pro-30x21` |
| **CEWE** ("PDF to Book") | Europe | big range, often discounts, layflat photo paper option | PDF, single pages (+ cover PDF), PDF 1.3 | option | `cewe-large-portrait`, `cewe-xl-square`, `cewe-xxl-landscape` |
| **Blurb** ("PDF to Book") | worldwide (US/UK) | many sizes, ImageWrap hardcover, layflat paper option (max 110 pages) | PDF, single pages | option | `blurb-standard-portrait`, `blurb-large-landscape`, `blurb-large-square` |
| any service with its own editor (Mixbook, Shutterfly, Albelli/Bonusprint, the CEWE app, Artifact Uprising, …) | everywhere | familiar shops, frequent offers | place one finished image per page in their editor | depends | `editor-images` + `formatOverrides` |

## How to pick (say it in one line each)
- **Trip or wedding, wants the best result, EU/UK/US**: Saal Digital layflat (photo paper, pages lie flat, photos across the fold). Recommended default.
- **Budget-minded in Europe**: CEWE (watch for discounts); layflat costs extra.
- **Outside Europe, or wants a softcover/magazine**: Blurb.
- **Already uses a shop they like** or has a voucher: `editor-images` for that shop. Warn that placing many page images by hand takes some clicks, and that pages crossing the fold only work if that shop offers layflat.

## Turning their answers into a format
- Shape: portrait 21x28 / 8x10 in, landscape 28x21 / 13x11 in, square 30x30 / 12x12 in.
- Layflat: Saal formats are layflat. CEWE and Blurb: layflat is a paper option; if they order it, set `formatOverrides: { layflat: true }`; if not, keep layflat off so no photo crosses the fold.
- Page count: each format has min/max and a step (CEWE adds pages in groups of 4). The layout keeps to it.

## Verifying a format (before the final export)
`verified: false` formats come from public information, not from the printer's template. Before the person uploads:
1. Open the format's `url` (from `photobook formats --json`) or the service's "PDF upload"/"professional" page.
2. Download the template for their exact size **and page count** (the spine width depends on the page count).
3. Read: page trim size, bleed, cover height, cover wrap (the part folded around the board), spine width, hinge. Ask the person to paste them or share the template file (PDF/IDML/PSD); you can read sizes from a PDF template with the engine's mupdf (`page.getBounds()` in points; mm = pt x 25.4 / 72).
4. Put them under `formatOverrides:` in book.yaml, plus `verified: true`, re-run `render` and check the cover preview.
5. If you cannot verify: tell them plainly that the service's upload check may reject the files, or the cover may be slightly off.

## Adding a new service
Add an entry to `engine/src/formats.mjs` (same fields as the others; `verified: true` only with template values) and a row above.
