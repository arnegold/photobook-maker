# Design rules and turning notes into changes

These rules come from making a real 72-page layflat travel book. The automatic layout follows them; keep them when you edit.

## What makes it good
- **It is about their photos.** Photo-dense, little white space (unless they chose airy). Every page costs money: no wasted pages.
- **Hierarchy**: per page one or two big photos, the rest small. Not every photo needs to be big. The photos they marked ✓ (and photos of people, funny or story moments) get the big places; ? photos are small fillers, never bigger than a ✓ photo.
- **People early**: show the main characters early in each chapter, not only from the third spread.
- **Story order**: chronological inside a chapter unless their notes ask otherwise.
- **Rhythm**: vary layouts: big+small, an even grid, a photo across the fold. Never the same layout twice in a row.
- **Consistent edges**: 4 mm around the page and between photos (2 + 2 mm across the fold). Full-bleed photos (to the paper edge) are fine for big moments.
- **Text** only on the cover and in the slim chapter title line (one line about 14 mm high: mark · TITLE · subtitle, dates on the right). No captions unless asked.
- **Low-resolution photos** (phone screenshots, video frames, WhatsApp copies) stay small. Below 200 ppi at printed size looks soft; below 150 ppi make it smaller or drop it.

## Layflat books
- One photo over both pages (`spread: { photo, hero: true }`) for the best wide photos: about one per chapter at most.
- Big photos crossing the fold (frames with a box past the page edge): keep **faces and important details out of the middle** (about 15 mm each side of the fold). Use `focus` to shift the crop, or mirror the design.
- Overlapping prints: a smaller photo with a white edge (`border: 3`, `z: 2`) on top of a big one. Do not cover faces in the big photo.
- **Not layflat**: nothing may cross the fold, no `spread:` photos; each page stands alone and keeps 8+ mm from the fold for faces.

## Inside covers
Some services (CEWE, Blurb, editors) do not print the inside of the covers: then spread 1 left and the last spread's right page are `template: endpaper`, and the book starts on a right-hand page. Saal prints them (no endpapers needed).

## From a note to book.yaml
Previews show a small code on every photo (the last digits of its file name, e.g. `1234`). Notes usually use those.

| note | change |
|---|---|
| "1234 bigger" / "this one big" | `{ src: IMG_1234, big: true }` in its page's `photos`, or give it its own page / a crossing frame on layflat |
| "1234 smaller" | remove `big`, move it into a page with more photos, or into a `pack` |
| "swap 1234 and 1250" | swap the two names |
| "remove 1234" | delete it (do not move it elsewhere unless asked). If that empties a page, ask what goes there |
| "add 1300 here" | add the name; check the page doesn't get more than ~6 photos |
| "crop off the left person" / "more sky" | `focus: [x, y]` (0..1 from left/top) and/or `zoom: 1.2` on that photo |
| "too busy" | fewer photos on that spread: move some to a neighbour or add a spread |
| "boring" / "same as the last page" | another arrangement: `arrange: "big left"`, `"rows 1+2"`, a crossing frame, a band |
| "colours don't match" (phone vs camera) | `grade: <reference photo>` on the phone photo (colour-matched to that photo); `{ ref, strength: 0.6, warmth: 4, exposure: -3 }` to fine-tune |
| "different cover photo" | `cover.front.photo` |
| a page where the chapter title should go | `title: true` on that page (or `{ title: true, box: [...] }` in frames) |

Arrangements for a page (`arrange:`): `"rows 2+1"` (2 photos on top, 1 below), `"cols 1+2"`, `"big left"`, `"big right"`, `"big top"`, `"big bottom"`, optionally with a share, e.g. `"big left 0.6"`. Without `arrange`, the engine picks the arrangement that crops least.

Layflat spread designs made by `layout` (edit them like any frames):
- **wide**: a big photo over one page and a third of the other, the rest in a column.
- **overlap**: wide + one photo with a white edge on top of the big one.
- **band**: a wide photo across both pages (top or bottom), the rest below or above it.
- **hero**: one photo over both pages.

## Adding or removing spreads
Spreads are found by their `id` (e.g. `ch2-3`); notes are attached to the id, so inserting a spread does not mix up notes. Keep the page-count rule of the service (render warns). A new spread needs a unique id.
