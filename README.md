# 📖 Photobook Maker

### You've got 2,000 photos from that trip. They deserve better than your camera roll.

**Photobook Maker** turns a folder of photos into a real, print-ready photo book by *talking to Claude*. No design software, no dragging 300 pictures into tiny boxes at midnight, no uploading your family photos to some website's editor.

You say **"make me a photobook"**. A few friendly questions later you're flipping through your own layflat album, with big photos running across the fold and small prints overlapping like a scrapbook. Then you get the PDFs to send to the printer.

![A layflat spread: one big photo across the fold, an overlapping print with a white edge, and a column of smaller photos](docs/img/spread-overlap.jpg)

<sub>All images here come from the built-in test trip: 78 fake photos of an imaginary week in Portugal. Your book will have real people in it.</sub>

---

## ✨ What it feels like

> **You:** make me a photobook
>
> **Claude:** Lovely! What's it for: a trip, a year, a wedding…?
>
> **You:** Our Portugal trip, about 40 pages, nice but not crazy expensive
>
> **Claude:** Then I'd go for **Saal Digital, 21×28 layflat**: real photo paper, and the pages open completely flat, so a photo can run across both pages. Where are the photos?
>
> **You:** `D:\Pictures\Portugal 2026`
>
> **Claude:** 1,412 photos from 3 to 9 June, 1,300 of them with a location. They look like three places: **Lisbon** (3 days), **Sintra** (1 day) and **Porto** (2 days). Shall I make those the chapters?
>
> **You:** yes!
>
> **Claude:** I've opened a page where you can pick your favourites. Press ✓ / ? / ✗, or just hit 1 / 2 / 3 while flipping through…

…and a little later:

> **Claude:** Your first design is ready: 40 pages, 3 chapters, 118 photos. Write under any spread what you'd change.
>
> **You:** *(under spread 7)* swap 1234 and 1250, and make the kids one bigger
>
> **Claude:** Done: the new version is on the page.

## 🎯 What it does

| | |
|---|---|
| 🗺️ **Reads your photos** | Dates, GPS and cameras turn into chapter suggestions: per city, per day or per month. It flags near-duplicates (bursts) and files too small to print big. |
| ✅ **A picker built for hundreds of photos** | A local web page with every photo per chapter, keyboard picking (1 / 2 / 3, ← →) and a note box under each photo. Everything saves itself. |
| 🖨️ **Knows the printers** | Saal Digital, CEWE, Blurb, or *any* shop with an online editor. Trim, bleed, safe area, spine width per page count, page-count rules, and whether the inside covers get printed. |
| 📐 **Designs for your book** | Layflat books get **hero spreads, big photos across the fold, bands and overlapping prints**. Normal books keep everything clear of the binding. The ✓ favourites get the big places. |
| 🔁 **Preview rounds** | Every photo shows a small code on the previews. Write "1288 bigger" or "too busy", Claude changes the book, you reload. Notes stay attached to their spread. |
| 📦 **Print-ready output** | `content.pdf` + `cover.pdf` (or 300 ppi page images), fonts embedded, sRGB, a resolution report, and a preflight check. |
| 🔒 **Your photos stay yours** | The originals are only *read*: never moved, renamed or changed. Nothing is uploaded. It all runs on your own computer. |

![The whole test book at a glance: cover, chapter openers, hero spreads and mixed layouts](docs/img/whole-book.jpg)

### Layflat vs. classic
The same picks give two different books, because each is designed for its binding:

| layflat (Saal) | classic binding (Blurb) |
|---|---|
| ![A band photo across both pages](docs/img/spread-band.jpg) | ![Two independent pages, nothing crossing the fold](docs/img/spread-classic.jpg) |

## 🚀 Get started

You need the **Claude desktop app** (paid plan, for the Code tab), **Node.js** (free, one installer) and **this plugin**. Step-by-step guide for non-techies: **[docs/INSTALL.md](docs/INSTALL.md)**.

```
/plugin marketplace add arnegold/photobook-maker
/plugin install photobook@photobook-maker
```

Then open the Code tab and say:

> **make me a photobook**

## 🖨️ Supported printers

| service | formats | upload |
|---|---|---|
| **Saal Digital** | 21×28 ✅ verified, 28×21, 30×30, Professional Line 30×21 (all layflat) | PDF spreads |
| **CEWE** "PDF to Book" | Large Portrait, XL Square, XXL Landscape (layflat optional) | PDF pages |
| **Blurb** "PDF to Book" | 8×10, 13×11, 12×12 (layflat paper optional) | PDF pages |
| **Anything with an editor** (Mixbook, Shutterfly, Albelli, …) | any size | page images |

Only Saal 21×28 is ✅ verified against the printer's own template; the design rules come from a real 72-page book printed in that format. The others use public specs, so before the final export Claude asks you for the template numbers of your exact book. Adding a printer takes one entry in [`engine/src/formats.mjs`](engine/src/formats.mjs). PRs welcome!

## 🛠️ Under the hood

<details>
<summary>For the curious and the contributors</summary>

```
.claude-plugin/           plugin + marketplace manifest (this repo is both)
skills/photobook/         the guided flow Claude follows (SKILL.md), service guide, design rules
engine/bin/photobook.mjs  one command line for every step
engine/src/               formats · scan (EXIF -> chapters) · autolayout · layout (packing, frames across the fold)
                          · render (previews + print PDFs) · review page + tiny local server
engine/fonts/             Jost (SIL Open Font License)
engine/test/              a fake 78-photo trip + an end-to-end test
```

Node.js with [sharp](https://sharp.pixelplumbing.com), [pdfkit](https://pdfkit.org), [mupdf](https://mupdf.com), [exifr](https://github.com/MikeKovarik/exifr) and js-yaml.

Each book lives in its own folder (e.g. `Documents/Photobooks/Portugal 2026/`):

| file | what |
|---|---|
| `book.yaml` | the whole book: format, chapters, every spread, cover. Commented, hand-editable |
| `feedback.json` | your ✓ / ? / ✗ marks and notes from the review page |
| `questions.yaml` | Claude's open questions (shown on the review page) |
| `out/preview/`, `out/Book preview.pdf` | previews |
| `out/print/` | the files to upload |
| `cache/` | thumbnails, crops, old versions of book.yaml (safe to delete) |

A spread in `book.yaml` reads like this:

```yaml
  - id: lisbon-5
    left: {frames: [{photo: DSC_1025, box: [0, 0, 290, 270]}, {photo: DSC_1029, box: [16, 198, 84, 56], border: 3, z: 2}]}
    right: {frames: [{pack: [DSC_1026, IMG_1830, IMG_1837], box: [84, 4, 122, 262]}]}
```

The first box is wider than the 210 mm page, so it crosses the fold. The bordered photo sits on top of it, and the right page arranges three photos by itself. A simple page is just `left: {photos: [a, b, c]}`.

**Without Claude**, the engine is a normal CLI:

```
npm install
node engine/bin/photobook.mjs help
node engine/bin/photobook.mjs new ~/Photobooks/Trip --photos ~/Pictures/Trip --format saal-21x28 --title "Trip 2026"
node engine/bin/photobook.mjs scan --book ~/Photobooks/Trip
node engine/bin/photobook.mjs chapters --apply --by place --book ~/Photobooks/Trip
node engine/bin/photobook.mjs review --serve --open --book ~/Photobooks/Trip
node engine/bin/photobook.mjs layout --book ~/Photobooks/Trip
node engine/bin/photobook.mjs render --book ~/Photobooks/Trip
node engine/bin/photobook.mjs print --book ~/Photobooks/Trip
```

**Test**: `npm test` makes the fake trip and runs new → scan → chapters → pick → layout → render → review → print for a layflat book, a classic book and an editor-images book.

**Known limits**: iPhone HEIC and RAW files need to be exported as JPEG first. Text is Latin by default; add a CJK font in `style.fonts.cjk` for Chinese, Japanese or Korean titles.
</details>

## 📄 License
MIT for the code. Jost font: SIL Open Font License.

*Made because a 72-page photo book of a trip deserved better than a weekend in a clunky online editor.*
