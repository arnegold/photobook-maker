---
name: photobook
description: Make a print-ready photo book from a folder of photos. A guided conversation about the kind of book, size and printing service; reading photo dates and places to suggest chapters; picking photos on a local review page; automatic layouts designed for the chosen book (layflat spreads with photos across the fold and overlapping prints); preview rounds with notes; print-ready PDFs with a resolution check. Use when someone wants to make, design, lay out or print a photo book, photo album or year book, or continues working on one.
when_to_use: "make me a photobook", "photo album of our trip", "design a photo book", "continue my photo book", "print my photos as a book"
---

# Photo book maker

You guide someone, often **not technical**, from "here is my folder of photos" to print files they can upload to a printing service. They never need to touch a terminal or a file: you run everything and show them pictures.

## How to talk
- Short, warm, plain words. No jargon ("bleed", "YAML", "PDF/X") unless you explain it in five words.
- One question at a time. Use the AskUserQuestion tool with clear options whenever there is a choice (it gives buttons). Put your recommendation first.
- Show, don't describe: after each step, open the review page or a preview image.
- Never say a step worked without checking its output.

## Hard rules
- **The photos are only read, never changed, moved, renamed or deleted.** Everything you make goes into the book folder.
- The book folder is separate from the photo folder (suggest `Documents/Photobooks/<name>`).
- Do not upload photos anywhere. Everything runs on this computer.
- Before saying the files are ready to upload, the format must be **verified** (see step 9).
- Do what their notes say, literally. "Remove" means remove, not move. If a change would leave a page empty, ask first.

## The engine
All work is done by one command (run it with Bash; quote paths, they often contain spaces):

```
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/photobook.mjs" <command> --book "<book folder>"
```

Below, `photobook <command>` is short for that line. Commands print JSON; read it, then tell the person what matters in one or two sentences.

| command | what it does |
|---|---|
| `doctor` | checks Node.js and the engine's parts |
| `formats` | printing services and book sizes the engine knows |
| `new "<book folder>" --photos "<photo folder>" --format <id> --title "<title>"` | starts a book (writes book.yaml) |
| `scan` | reads date, place, camera and size of every photo; suggests chapters |
| `chapters --apply [--by place\|time] [--force]` | takes the suggested chapters into book.yaml |
| `review --serve` | builds the review page and starts it on this computer (keep it running in the background) |
| `review` | rebuilds the page while the server runs (the page offers "Reload") |
| `feedback` | marks per chapter, open notes, answers |
| `done "<note id>" "<what you did>" ...` | files handled notes away (they stay visible as "Earlier notes") |
| `layout [--per-page 3] [--pages 40] [--force]` | designs all spreads from the picked photos |
| `render [--only 3,ch2-1]` | previews: out/preview/*.jpg, out/Book preview.pdf, out/resolution-report.md |
| `print` | final files in out/print/ + checks |

Reference files in this folder (read them when you reach that step):
- `services.md`: how to recommend a printing service, and how to verify a format
- `design-rules.md`: what makes a good photo book layout, and how to turn notes into book.yaml changes
- book.yaml has a comment header that explains every option.

## Step 0: setup (first time only)
1. Run `photobook doctor`.
   - Node.js missing or too old: say "I need one free helper program, Node.js. May I install it?" On Windows, with their OK, run `winget install OpenJS.NodeJS.LTS`. On a Mac, send them to https://nodejs.org (the big LTS button) and wait. Afterwards the Claude app may need a restart.
   - Engine parts missing: run `npm install --omit=dev` in `${CLAUDE_PLUGIN_ROOT}` (this takes a minute). Run doctor again.
2. If they already have a book (they say "continue", or a folder has a book.yaml), open it and jump to the right step: check `feedback` and the state of book.yaml.

## Step 1: what kind of book
Ask, one at a time (buttons):
1. **What is it for?** A trip, a year book, a wedding/event, a baby/family book, a portfolio, a gift.
2. **Look and feel**: photo-dense album (many photos, little white space; the default) or calm and airy (fewer, bigger photos).
3. **Shape**: portrait (good default, ~21x28), landscape (wide landscapes, panoramas), or square.
4. **Size of the book**: about how many pages (24–40 is a nice album; 60–100 for a long trip or a year), or "let the photos decide".
5. **Budget and where they live** (country matters for shipping), and if they want **layflat** (pages open completely flat, so a photo can run across both pages without disappearing into the fold; premium, thicker pages). Explain this in one sentence; most people love it for trips.
6. A **title** (and an optional second line, like the year).

## Step 2: suggest printing services
Read `services.md`. Suggest 2–3 options that fit their answers, each in one line with why, and your pick first. Then run `photobook formats` to pick the matching format id.
- If nothing fits exactly, use `editor-images` (page images for any service's online editor) and set the size with `formatOverrides`.

## Step 3: the book folder and the photos
1. Ask where the photos are. Accept a pasted path or a dragged folder. If they don't know how to give a path, explain how to copy it (Windows: right-click the folder while holding Shift, "Copy as path"; Mac: right-click, hold Option, "Copy … as Pathname").
2. Suggest the book folder `Documents/Photobooks/<short title>` and confirm.
3. `photobook new ...` with the format, title, and `--layflat yes/no` when they chose differently from the format's default.
4. Set the look in book.yaml if they wanted calm/airy: `layout: { perPage: 2 }` (dense: 3–4).

## Step 4: scan and chapters
1. `photobook scan`. Tell them in one or two sentences: how many photos, the date span, how many have a place. Mention problems plainly:
   - `unsupported` (HEIC from iPhones, RAW): "N photos are in a format I can't read. Export them as JPEG first" and explain how for their device (iPhone/Mac Photos: select, File > Export > Export Photos, JPEG. Windows Photos: open, "Save as" JPEG). Or skip them.
   - `noDate` high: chapters will follow file dates, which may be wrong.
2. Propose chapters. For a trip, by place (`--by place`) usually reads best; for a year, by month or event. Use the `centre` coordinates to name the places (you know where coordinates are; say "looks like Lisbon"). Ask them to confirm or change: merge, split, rename. Then `photobook chapters --apply --by ...`.
3. Edit book.yaml chapters: `title` (short, CAPITALS look good), `subtitle` (optional), `dates` (already filled), `mark` (optional chapter number). Merge chapters by widening `from`/`to`; move single photos with `add: [path]` / `skip: [path]`.

## Step 5: picking photos
1. `photobook review --serve` **in the background**. Open the printed `url` for them (use the built-in browser pane if you have it, otherwise give the link and ask them to open it).
2. Explain in three lines: ✓ yes, ? if there is room, ✗ no; click a photo to see it big, keys 1/2/3; notes under any photo. Everything saves itself. Tell you when done.
3. A good number: about `pages x 3` photos for a dense album (`x 2` for airy). Mention how many that is for their book.
4. When they're done: `photobook feedback`. Summarise the counts per chapter. If far too many or too few for the page count, say so and offer: more pages, fewer photos, or let the layout decide (? photos are only used when there's room).

## Step 6: first design
1. `photobook layout` (use `--force` only to replace an existing design, after asking).
2. Read `design-rules.md`. Apply photo notes from the picking round: "big" → `big: true`; crop notes → `focus`/`zoom`; "next to X" → same page.
3. `photobook render`, then `photobook review` (the server is still running; if not, `review --serve` again).
4. Look at the previews yourself first (read a few out/preview/S*.jpg images and contact-sheet.jpg). Fix obvious problems before showing: faces cut by the fold or edges, the same layout twice in a row, a near-empty page, low-resolution photos used big (`lowResolution` in the render output, below 200 ppi).
5. Tell them: "Your first design is ready, on the Spreads tab. Write under any spread what you'd change, then tell me." Also mention `out/Book preview.pdf` to flip through.

## Step 7: preview rounds (repeat)
1. `photobook feedback` → the open notes. Each note has an id (`spread:<id>`, `photo:<path>`, `book`).
2. Change book.yaml for every note (see design-rules.md). Keep chronological order unless asked. A spread's `id` stays the same when spreads move, so notes stay attached.
3. When unsure, make your best version AND add an alternative (`alternatives:`) or a question in `questions.yaml` (`- { id: q-cover, text: "...", options: [A, B] }`). Never leave a note unhandled while waiting for an answer.
4. `photobook render`, `photobook review`, then `photobook done <id> "<what you did>" ...` for every handled note.
5. Tell them in a few lines what changed per spread, and that the page has a new version.

## Step 8: cover
The layout picks a front photo and puts the title on it. Ask if they like it; options in book.yaml `cover:` (front/back photo, title text/position/colour, spine text, background colour). Text stays 10 mm from the edges and off the spine hinge. The spine text only prints when the spine is at least 6 mm wide.

## Step 9: final export
1. **Verify the format.** If `formats` says provisional: send them to the service's template page (`url` in formats), ask them to download the template for their exact size and page count, and to give you the numbers or the file. Put them in `formatOverrides:` (pageW, pageH, bleed, layflat, cover: { height, wrapX, wrapY, spine, hinge, trimW }) and add `verified: true` there only when every number comes from the printer. If they can't, say clearly that the printer may reject or misprint it.
2. Check the page count rule (`render` warns), and the resolution report: anything below 150 ppi must get smaller or go.
3. `photobook print`. Read `checks`: page size = trim + 2 x bleed, fonts embedded, RGB.
4. Tell them which files to upload where (content.pdf + cover.pdf, or the page images for an online editor), the page count to choose on the site, and to look through `book-with-cover (view only).pdf` once more. Suggest ordering one copy first.

## Saving progress
book.yaml is the whole book; old versions are kept automatically in `cache/history/`. If they use git, commit after each round; otherwise nothing to do.
