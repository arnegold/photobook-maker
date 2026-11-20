// Writing book.yaml (with the explanatory header) and finding which photos belong to which chapter.
import * as yaml from 'js-yaml';
import { saveBook } from './workspace.mjs';

export const HEADER = `# Photo book – everything about the book is described in this file. Claude edits it for you;
# you can also change it by hand. Render previews with:  photobook render
#
# photos:   the folder with your photos. It is only read, never changed.
# format:   the printer's book product (photobook formats). formatOverrides: exact numbers from the printer's template.
# chapters: in book order. A photo belongs to a chapter when it was taken between from and to
#           (add: extra photos, skip: photos to leave out of that chapter).
#           title / subtitle / dates are printed in the slim title line on the chapter's first page.
# spreads:  one entry per double page, left page + right page:
#   left: { photos: [IMG_1, IMG_2, IMG_3] }        photos arranged automatically; { title: true } adds the chapter title
#          arrange: "rows 2+1" | "cols 1+2" | "big left" | "big top"   to choose the arrangement yourself
#          a photo can be { src: IMG_1, big: true, focus: [0.4, 0.5], zoom: 1.2 }
#            big = gets the largest place; focus = point kept in view when cropping (0..1 from left/top); zoom = crop tighter
#   left: { frames: [ { photo: IMG_1, box: [x, y, w, h] }, { pack: [IMG_2, IMG_3], box: [...] } ] }
#          exact boxes in mm from the page's top-left corner. A box reaching past the page edge crosses the fold
#          (layflat books). border: 3 = white edge (for photos overlapping each other), z: 2 = drawn on top.
#   spread: { photo: IMG_9, hero: true }           one photo over both pages (layflat books)
#   left: { template: endpaper }                   inside of the cover, left empty
# alternatives: other versions of a spread to compare ({ of: <spread id>, id, left, right }); previewed, never printed.
`;

const dump = (v, flowLevel = -1) => yaml.dump(v, { lineWidth: 160, flowLevel, noRefs: true }).trimEnd();

export function bookText(book) {
  const { title, photos, format, formatOverrides, pages, layout, style, cover, chapters, spreads, alternatives, ...rest } = book;
  const parts = [HEADER];
  parts.push(dump({ title, photos, format }));
  if (formatOverrides) parts.push(dump({ formatOverrides }, 2));
  if (pages || layout) parts.push(dump({ ...(pages ? { pages } : {}), ...(layout ? { layout } : {}) }, 2));
  if (Object.keys(rest).length) parts.push(dump(rest, 2));
  parts.push('', '# Look of the book. Only list what you want to change (defaults: engine/src/style.mjs).', dump({ style: style || {} }, 3));
  parts.push('', dump({ cover: cover || {} }, 2));
  parts.push('', 'chapters:' + (chapters && Object.keys(chapters).length ? '\n' + Object.entries(chapters).map(([id, c]) => `  ${id}: ${dump(c, 0)}`).join('\n') : ' {}'));
  parts.push('', 'spreads:' + (spreads?.length ? '\n' + spreads.map(spreadText).join('\n') : ' []'));
  if (alternatives?.length) parts.push('', 'alternatives:\n' + alternatives.map(spreadText).join('\n'));
  return parts.join('\n') + '\n';
}
// one spread: id/chapter on the first line, each page on its own line in flow style
function spreadText(s) {
  const { id, chapter, of, note, left, right, spread, ...more } = s;
  const head = { ...(of ? { of } : {}), id, ...(chapter ? { chapter } : {}), ...(note ? { note } : {}), ...more };
  const entries = [...Object.entries(head), ['left', left], ['right', right], ['spread', spread]].filter(([, v]) => v !== undefined);
  return entries.map(([k, v], i) => `${i ? '    ' : '  - '}${k}: ${dump(v, 0)}`).join('\n');
}

export const writeBook = (ws, book) => { saveBook(ws, bookText(book)); ws.book = book; };

// Photos (inventory rows) per chapter: { chapterId: [rows] , _none: [rows] }
export function photosByChapter(book, rows) {
  const chs = Object.entries(book.chapters || {});
  const out = Object.fromEntries([...chs.map(([id]) => [id, []]), ['_none', []]]);
  const byFile = new Map(rows.map(r => [r.file, r]));
  const added = new Map();
  for (const [id, c] of chs) for (const f of c.add || []) added.set(f, id);
  for (const r of rows) {
    if (added.has(r.file)) { out[added.get(r.file)].push(r); continue; }
    const hit = chs.find(([, c]) => !(c.skip || []).includes(r.file) && (!c.from || r.taken >= c.from) && (!c.to || r.taken <= c.to) && (c.from || c.to));
    (hit ? out[hit[0]] : out._none).push(r);
  }
  for (const [f, id] of added) if (!byFile.has(f)) out[id].push({ file: f, missing: true });
  return out;
}
