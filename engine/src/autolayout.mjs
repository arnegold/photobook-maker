// First draft of the whole book from the picked photos: chapters -> spreads, designed for the chosen format.
//   layflat books: one-photo-over-both-pages spreads, big photos crossing the fold, overlapping prints with a white edge
//   other books:   every page on its own (nothing crosses the fold, which disappears into the binding)
// The result is written to book.yaml; previous versions are kept in cache/history/.
import { photosByChapter } from './bookfile.mjs';
import { shortName } from './photos.mjs';
import { printedPages, pageCountOk } from './formats.mjs';
import { withDefaults } from './style.mjs';
import { pack } from './layout.mjs';

const RANK = { like: 2, maybe: 1 };

export function selectPhotos(book, rows, marks) {
  const byCh = photosByChapter(book, rows);
  const out = [];
  const notes = [];
  for (const id of Object.keys(book.chapters || {})) {
    const all = byCh[id].filter(r => !r.missing);
    const marked = all.filter(r => marks[r.file]);
    let pick;
    if (marked.length) pick = all.filter(r => marks[r.file] === 'like' || marks[r.file] === 'maybe');
    else {   // nothing picked yet in this chapter: take everything, one photo per burst
      const seen = new Set();
      pick = all.filter(r => (seen.has(r.burst) ? false : seen.add(r.burst)));
      if (all.length) notes.push(`${id}: no photos picked yet – using all ${pick.length} (one per burst)`);
    }
    out.push({ id, photos: pick.map(r => ({ ...r, rank: RANK[marks[r.file]] || 0 })) });
  }
  return { chapters: out.filter(c => c.photos.length), notes };
}

const better = (a, b) => (b.rank - a.rank) || (b.w * b.h - a.w * a.h);
const pickBig = (list, wantLandscape = false) => [...list].sort((a, b) => (wantLandscape ? (b.ratio >= 1.25) - (a.ratio >= 1.25) : 0) || better(a, b))[0];
const ref = (r, extra = {}) => (Object.keys(extra).length ? { src: shortName(r.file), ...extra } : shortName(r.file));
const r1 = (v) => Math.round(v * 10) / 10;

// spread recipes -> book.yaml spread objects
function makeRecipes(fmt, style) {
  const W = fmt.pageW, H = fmt.pageH, m = style.margin, g = style.gap;
  const ext = r1(W * 0.38);                       // how far a big photo reaches into the other page
  const inner = { y: m.top, h: H - m.top - m.bottom };
  const markBig = (list) => { if (list.length < 3) return list.map(r => ref(r)); const b = pickBig(list); return list.map(r => ref(r, r === b && b.rank > Math.max(...list.filter(x => x !== b).map(x => x.rank), -1) ? { big: true } : {})); };
  const page = (list, title) => (list.length ? { photos: markBig(list), ...(title ? { title: true } : {}) } : { template: 'blank' });
  return {
    pages: (L, R, { title, titleRight } = {}) => ({ ...(L ? { left: page(L, title && !titleRight) } : {}), ...(R ? { right: page(R, title && titleRight) } : {}) }),
    hero: (p, { title } = {}) => ({ spread: { photo: ref(p, p.focus ? { focus: p.focus } : {}), hero: true, ...(title ? { title: true } : {}) } }),
    // big photo over the left page and into the right page; the rest in a column on the right (or mirrored)
    wide: (big, rest, { side = 'left', title, inset } = {}) => {
      const bigF = { photo: ref(big), box: side === 'left' ? [0, 0, r1(W + ext), H] : [-ext, 0, r1(W + ext), H] };
      const colW = r1(W - ext - g - m.outer);
      const col = { pack: rest.map(r => ref(r)), box: side === 'left' ? [r1(ext + g), inner.y, colW, inner.h] : [m.outer, inner.y, colW, inner.h], ...(title ? { title: true } : {}) };
      const frames = [bigF];
      if (inset) {   // an overlapping print with a white edge, on the big photo
        const w = r1(Math.min(W * 0.4, (H * 0.4) * inset.ratio)), h = r1(w / inset.ratio), b = 3;
        frames.push({ photo: ref(inset), box: side === 'left' ? [r1(m.outer + 12), r1(H - 16 - h), w, h] : [r1(W - m.outer - 12 - w), r1(H - 16 - h), w, h], border: b, z: 2 });
      }
      return side === 'left' ? { left: { frames }, right: { frames: [col] } } : { left: { frames: [col] }, right: { frames } };
    },
    // a wide photo as a band across both pages (top or bottom), the rest below/above it on each page
    band: (big, L, R, { at = 'top', title } = {}) => {
      const bw = 2 * W - 2 * m.outer;
      const bh = r1(Math.min(0.58 * H, Math.max(0.42 * H, bw / big.ratio)));
      const y = at === 'top' ? m.top : H - m.bottom - bh;
      const ry = at === 'top' ? m.top + bh + g : m.top, rh = inner.h - bh - g;
      return {
        left: { frames: [{ photo: ref(big), box: [m.outer, y, bw, bh] }, ...(L.length ? [{ pack: L.map(r => ref(r)), box: [m.outer, ry, r1(W - m.outer - m.inner), r1(rh)], ...(title ? { title: true } : {}) }] : [])] },
        right: { frames: R.length ? [{ pack: R.map(r => ref(r)), box: [m.inner, ry, r1(W - m.outer - m.inner), r1(rh)] }] : [] },
      };
    },
  };
}

export function autolayout(ws, rows, marks, opts = {}) {
  const { book, fmt } = ws;
  const style = withDefaults(book.style);
  const perPage = opts.perPage || book.layout?.perPage || 3;
  const { chapters, notes } = selectPhotos(book, rows, marks);
  if (!chapters.length) throw new Error('No chapters with photos. Run "photobook scan" and "photobook chapters --apply" first.');
  const R = makeRecipes(fmt, style);
  const layflat = !!fmt.layflat;
  const m = style.margin;
  // how well a list of photos fills one page (lower = better), using the same packing as the renderer
  const pageScore = (list, title) => {
    if (!list.length) return 9;
    const th = title ? (style.titleLine.height + style.gap) : 0;
    const rect = { x: 0, y: 0, w: fmt.pageW - m.outer - m.inner, h: fmt.pageH - m.top - m.bottom - th };
    return pack(rect, list.map(r => ({ ratio: r.ratio, big: false })), style.gap).s;
  };
  // big photo for a "wide" spread: a liked photo whose shape suits the big box and leaves a column that fills well
  const wideBig = (L) => {
    const bigR = (fmt.pageW * 1.38) / fmt.pageH;
    const col = { x: 0, y: 0, w: fmt.pageW * 0.62 - style.gap - m.outer, h: fmt.pageH - m.top - m.bottom };
    let best = null, bs = Infinity;
    for (const c of L) {
      const rest = L.filter(p => p !== c);
      const s = pack(col, rest.map(r => ({ ratio: r.ratio })), style.gap).s + Math.abs(Math.log(bigR / c.ratio)) - 0.3 * c.rank;
      if (s < bs) { bs = s; best = c; }
    }
    return best;
  };

  // 1. spreads per chapter, then fit the page count rules (min / max / step) and an optional target
  const want = chapters.map(c => Math.max(1, Math.round(c.photos.length / (2 * perPage))));
  // inside covers that are not printed take the first left and last right page: a one-chapter book needs 2 spreads
  if (fmt.endpapers && chapters.length === 1) want[0] = Math.max(2, want[0]);
  const total = () => want.reduce((a, b) => a + b, 0);
  const target = opts.pages || book.pages;
  const fits = (s) => pageCountOk(fmt, printedPages(fmt, s)) && (!target || printedPages(fmt, s) >= target);
  // add spreads to the chapters with the most photos per spread until the rules are met
  let guard = 0;
  while (!fits(total()) && printedPages(fmt, total()) < fmt.pages.max && guard++ < 200) {
    const i = want.map((w, k) => chapters[k].photos.length / w).reduce((bi, v, k, a) => (v > a[bi] ? k : bi), 0);
    if (chapters[i].photos.length <= want[i] * 2) { notes.push('not enough photos for the minimum page count: some pages hold only one photo'); }
    want[i]++;
  }
  if (printedPages(fmt, total()) > fmt.pages.max) notes.push(`too many photos for ${fmt.pages.max} pages – pick fewer, or set layout.perPage higher`);

  // 2. per chapter: split photos over its spreads and choose a design per spread
  const spreads = [];
  const cycle = layflat ? ['wide', 'pages', 'band', 'pages', 'overlap', 'pages'] : ['pages'];
  let turn = 0, wideSide = 'left', bandAt = 'top';
  chapters.forEach((ch, ci) => {
    let photos = [...ch.photos];
    let units = want[ci];
    const firstHalf = fmt.endpapers && ci === 0;                         // book starts on a right page
    const lastHalf = fmt.endpapers && ci === chapters.length - 1;        // and ends on a left page
    const slots = [];
    // a hero spread (one photo over both pages) for the best wide photo of a bigger chapter
    let hero = null;
    if (layflat && units >= 4) {
      const cand = pickBig(photos.filter(p => p.ratio >= 1.3), true);
      if (cand && (cand.rank >= 1 || !photos.some(p => p.rank))) { hero = cand; photos = photos.filter(p => p !== hero); units--; }
    }
    // capacity per unit (a half unit = one page)
    const halves = Array.from({ length: units }, (_, k) => (firstHalf && k === 0 ? 'first' : lastHalf && k === units - 1 ? 'last' : null));
    const caps = halves.map(h => (h ? 1 : 2));
    const capSum = caps.reduce((a, b) => a + b, 0);
    let pos = 0;
    caps.forEach((c, k) => {
      const n = k === caps.length - 1 ? photos.length - pos : Math.round(photos.length * c / capSum);
      slots.push({ cap: c, half: halves[k], list: photos.slice(pos, pos + n) }); pos += n;
    });
    if (hero) {   // insert the hero spread where its photo belongs in time (never as the chapter opener or after the last page)
      let at = slots.findIndex(s => s.list.length && s.list[0].taken > hero.taken);
      if (at < 0) at = slots.length;
      at = Math.max(1, Math.min(at, lastHalf ? slots.length - 1 : slots.length));
      slots.splice(at, 0, { hero });
    }
    slots.forEach((s, k) => {
      const id = `${ch.id}-${k + 1}`;
      const head = { id, ...(k === 0 ? { chapter: ch.id } : {}) };
      const title = k === 0;
      if (s.hero) { spreads.push({ ...head, ...R.hero(s.hero) }); return; }
      const L = s.list;
      if (s.half) {   // a single page next to an inside cover
        if (s.half === 'first') spreads.push({ ...head, left: { template: 'endpaper' }, ...R.pages(null, L, { title, titleRight: true }) });
        else spreads.push({ ...head, ...R.pages(L, null, { title }), right: { template: 'endpaper' } });
        return;
      }
      // choose a design: the cycle, skipping designs that do not suit these photos
      let made = null;
      for (let tries = 0; tries < cycle.length && !made; tries++) {
        const kind = cycle[(turn + tries) % cycle.length];
        if (kind === 'wide' && L.length >= 3 && L.length <= 6) {
          const big = wideBig(L); const rest = L.filter(p => p !== big);
          made = R.wide(big, rest, { side: wideSide, title }); wideSide = wideSide === 'left' ? 'right' : 'left';
        } else if (kind === 'overlap' && L.length >= 4 && L.length <= 6) {
          const big = wideBig(L); const others = L.filter(p => p !== big); const inset = pickBig(others);
          made = R.wide(big, others.filter(p => p !== inset), { side: wideSide, title, inset }); wideSide = wideSide === 'left' ? 'right' : 'left';
        } else if (kind === 'band' && L.length >= 3 && L.length <= 9) {
          const big = pickBig(L.filter(p => p.ratio >= 1.4), true);
          if (big) { const rest = L.filter(p => p !== big); const h = Math.ceil(rest.length / 2); made = R.band(big, rest.slice(0, h), rest.slice(h), { at: bandAt, title }); bandAt = bandAt === 'top' ? 'bottom' : 'top'; }
        } else if (kind === 'pages' && L.length >= 1) {
          // split the photos over the two pages where they fill both pages best (least cropping, least white)
          let nL = L.length === 1 ? 1 : Math.ceil(L.length / 2), best = Infinity;
          for (let n = 1; n < L.length; n++) {
            const sc = pageScore(L.slice(0, n), !!title) + pageScore(L.slice(n), false) + 0.04 * Math.abs(n - L.length / 2);
            if (sc < best) { best = sc; nL = n; }
          }
          made = R.pages(L.slice(0, nL), L.length > 1 ? L.slice(nL) : [], { title });
        }
        if (made) turn = (turn + tries + 1) % cycle.length;
      }
      if (!made) made = R.pages(L, [], { title });
      spreads.push({ ...head, ...made });
    });
  });
  // 3. cover: the best photo whose shape suits the front, unless one is chosen already
  const cover = { ...(book.cover || {}) };
  if (!cover.front?.photo) {
    const all = chapters.flatMap(c => c.photos);
    const frontR = fmt.pageW / fmt.pageH;
    const best = [...all].sort((a, b) => (b.rank - a.rank) || (Math.abs(Math.log(a.ratio / frontR)) - Math.abs(Math.log(b.ratio / frontR))) || better(a, b))[0];
    if (best) cover.front = { photo: shortName(best.file) };
  }
  if (!cover.title) cover.title = { text: (book.title || 'PHOTO BOOK').toUpperCase(), x: 22, y: 30, color: 'white' };
  if (!cover.spine) cover.spine = (book.title || '').toUpperCase();
  return { spreads, cover, notes, pages: printedPages(fmt, spreads.length) };
}
