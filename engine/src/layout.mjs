// Page templates: turn a spread from book.yaml into drawable items in spread coordinates (mm).
// Origin = top-left of the LEFT page trim. Left page x in [0, W], right page x in [W, 2W].
import { photoMeta, resolveSrc } from './photos.mjs';

const EPS = 0.5;
const isTitle = (p) => p === 'TITLE' || (p && typeof p === 'object' && p.title === true && !p.src);

export function pageGeom(fmt, style, side, spec = {}) {
  const W = fmt.pageW, H = fmt.pageH;
  const m = spec.bleed ? { top: 0, bottom: 0, outer: 0, inner: 0 } : { ...style.margin, ...(spec.margin || {}) };
  const x0 = side === 'L' ? 0 : W;
  const l = side === 'L' ? m.outer : m.inner, r = side === 'L' ? m.inner : m.outer;
  return { side, x0, W, H, trim: { x: x0, y: 0, w: W, h: H }, content: { x: x0 + l, y: m.top, w: W - l - r, h: H - m.top - m.bottom } };
}

// "IMG_1234" or { src, focus, zoom, grade, big } -> normalised photo
function normPhoto(p, ctx) {
  const o = typeof p === 'string' || typeof p === 'number' ? { src: String(p) } : { ...p };
  o.rel = resolveSrc(String(o.src), ctx.folders);
  o.focus = o.focus || [0.5, 0.5];
  o.zoom = o.zoom || 1;
  o.folders = ctx.folders;
  ctx.used?.push(o.rel);
  return o;
}
const parseRatio = (r) => typeof r === 'string' ? r.split(':').map(Number).reduce((a, b) => a / b) : r;
async function ratioOf(p) {
  if (p.ratio) return parseRatio(p.ratio);
  const m = await photoMeta(p.rel);
  return m.ratio;
}

// Extend a box by the bleed on every side that touches the trim edge of `area`
function withBleed(box, area, b) {
  const { x, y, w, h } = box, x2 = x + w, y2 = y + h;
  const nx = Math.abs(x - area.x) < EPS ? x - b : x;
  const ny = Math.abs(y - area.y) < EPS ? y - b : y;
  const nx2 = Math.abs(x2 - (area.x + area.w)) < EPS ? x2 + b : x2;
  const ny2 = Math.abs(y2 - (area.y + area.h)) < EPS ? y2 + b : y2;
  return { x: nx, y: ny, w: nx2 - nx, h: ny2 - ny };
}
const imageItem = (page, box, photo, area, ctx, z = 0) => ({ kind: 'image', page, box, fill: withBleed(box, area, ctx.fmt.bleed), photo, z });
const titleItem = (page, box, ctx, z = 0) => ({ kind: 'titleblock', page, box, fill: box, chapter: ctx.chapter, z });

// ---------------------------------------------------------------- packing
// Arrange photos (each { ratio, big }) inside a rectangle. Tries rows, columns and "one big + the rest" layouts and
// keeps the one that crops the photos least, leaves little white space and gives a `big: true` photo the largest slot.
function compositions(n, maxPart) {
  const out = [];
  const rec = (left, acc) => { if (!left) { out.push(acc); return; } for (let k = 1; k <= Math.min(maxPart, left); k++) rec(left - k, [...acc, k]); };
  rec(n, []);
  return out;
}
function chunk(arr, sizes) { const out = []; let i = 0; for (const s of sizes) { out.push(arr.slice(i, i + s)); i += s; } return out; }

// rows (or columns when `vertical`), filling the rect (photos cropped a little) or fitting it (no crop, centred)
function linesLayout(rect, items, sizes, gap, vertical, fit) {
  const R = vertical ? { x: rect.y, y: rect.x, w: rect.h, h: rect.w } : rect;
  const lines = chunk(items, sizes);
  const S = lines.map(l => l.reduce((a, it) => a + (vertical ? 1 / it.ratio : it.ratio), 0));
  let W = R.w, k = 1;
  const natural = (W) => lines.map((l, i) => (W - gap * (l.length - 1)) / S[i]);
  let hs = natural(W);
  const sumH = hs.reduce((a, b) => a + b, 0), gapsH = gap * (lines.length - 1);
  if (!fit) { k = (R.h - gapsH) / sumH; hs = hs.map(h => h * k); }
  else if (sumH + gapsH > R.h) {
    W = (R.h - gapsH + gap * lines.reduce((a, l, i) => a + (l.length - 1) / S[i], 0)) / S.reduce((a, s) => a + 1 / s, 0);
    hs = natural(W);
  }
  const total = hs.reduce((a, b) => a + b, 0) + gapsH;
  let y = R.y + (R.h - total) / 2;
  const x0 = R.x + (R.w - W) / 2;
  const boxes = [];
  lines.forEach((l, i) => {
    let x = x0;
    for (const it of l) {
      const w = (vertical ? 1 / it.ratio : it.ratio) * (W - gap * (l.length - 1)) / S[i];
      boxes.push(vertical ? { x: y, y: x, w: hs[i], h: w } : { x, y, w, h: hs[i] });
      x += w + gap;
    }
    y += hs[i] + gap;
  });
  return boxes;
}

function score(rect, items, boxes) {
  const crops = boxes.map((b, i) => Math.abs(Math.log((b.w / b.h) / items[i].ratio)));
  const area = rect.w * rect.h;
  const used = boxes.reduce((a, b) => a + b.w * b.h, 0) / area;
  let s = crops.reduce((a, b) => a + b, 0) / crops.length + 0.6 * Math.max(...crops) + 2.6 * Math.max(0, 0.95 - used);
  const worst = Math.max(...crops);
  if (worst > Math.log(1.45)) s += 3 * (worst - Math.log(1.45));   // cutting away more than a third of a photo: avoid
  const smallest = Math.min(...boxes.map(b => b.w * b.h)) / area;
  if (smallest < 0.045) s += 0.4 * (0.045 - smallest) / 0.045 + 0.15;
  const bigI = items.findIndex(it => it.big);
  if (bigI >= 0 && items.length > 1) {
    const a = boxes.map(b => b.w * b.h), maxOther = Math.max(...a.filter((_, i) => i !== bigI));
    if (a[bigI] < maxOther * 1.25) s += 0.35;
  }
  return s;
}

const maxPart = (n) => (n <= 4 ? n : n <= 6 ? 3 : 4);
function bestLines(rect, items, gap, allowFit = true) {
  let best = null;
  for (const vertical of [false, true]) for (const sizes of compositions(items.length, maxPart(items.length)))
    for (const fit of allowFit ? [false, true] : [false]) {
      const boxes = linesLayout(rect, items, sizes, gap, vertical, fit);
      const s = score(rect, items, boxes) + 0.015 * sizes.length;
      if (!best || s < best.s) best = { s, boxes, how: `${vertical ? 'cols' : 'rows'} ${sizes.join('+')}${fit ? ' fit' : ''}` };
    }
  return best;
}
function featureLayouts(rect, items, gap) {
  if (items.length < 3) return [];
  let bi = items.findIndex(it => it.big);
  if (bi < 0) bi = 0;
  const big = items[bi], rest = items.filter((_, i) => i !== bi);
  const out = [];
  for (const side of ['left', 'right', 'top', 'bottom']) for (const frac of [0.5, 0.58, 0.66]) {
    const horiz = side === 'left' || side === 'right';
    const bw = horiz ? rect.w * frac - gap / 2 : rect.w, bh = horiz ? rect.h : rect.h * frac - gap / 2;
    const bb = { x: side === 'right' ? rect.x + rect.w - bw : rect.x, y: side === 'bottom' ? rect.y + rect.h - bh : rect.y, w: bw, h: bh };
    const rr = horiz ? { x: side === 'left' ? rect.x + bw + gap : rect.x, y: rect.y, w: rect.w - bw - gap, h: rect.h }
                     : { x: rect.x, y: side === 'top' ? rect.y + bh + gap : rect.y, w: rect.w, h: rect.h - bh - gap };
    const r = bestLines(rr, rest, gap, false);
    const boxes = []; let j = 0;
    items.forEach((_, i) => boxes.push(i === bi ? bb : r.boxes[j++]));
    out.push({ s: score(rect, items, boxes) - 0.05, boxes, how: `big ${side} ${frac}` });
  }
  return out;
}

// arrange: optional fixed choice, e.g. "rows 2+1", "cols 1+2", "big left", "big top 0.6"
export function pack(rect, items, gap, arrange) {
  if (!items.length) return { boxes: [], how: 'empty' };
  if (arrange) {
    const m = String(arrange).match(/^(rows|cols)\s+([\d+]+)(\s+fit)?$/);
    if (m) {
      const sizes = m[2].split('+').map(Number);
      if (sizes.reduce((a, b) => a + b, 0) === items.length) return { boxes: linesLayout(rect, items, sizes, gap, m[1] === 'cols', !!m[3]), how: arrange };
    }
    const b = String(arrange).match(/^big\s+(left|right|top|bottom)(?:\s+([\d.]+))?$/);
    if (b) {
      const all = featureLayouts(rect, items, gap).filter(c => c.how.startsWith(`big ${b[1]}`));
      const want = b[2] ? +b[2] : null;
      const pick = want ? all.reduce((a, c) => Math.abs(+c.how.split(' ')[2] - want) < Math.abs(+a.how.split(' ')[2] - want) ? c : a, all[0]) : all.sort((a, c) => a.s - c.s)[0];
      if (pick) return pick;
    }
  }
  const cands = [bestLines(rect, items, gap), ...featureLayouts(rect, items, gap)];
  return cands.sort((a, b) => a.s - b.s)[0];
}

// Place photos + optional chapter title line into a rectangle (spread coordinates)
async function packItems(page, rect, list, ctx, { area, title, arrange, z = 0 }) {
  const items = [];
  const gap = ctx.style.gap;
  let r = { ...rect };
  if (title) {
    const th = ctx.style.titleLine?.height ?? 14;
    items.push(titleItem(page, { x: r.x, y: r.y, w: r.w, h: th }, ctx, z));
    r = { ...r, y: r.y + th + gap, h: r.h - th - gap };
  }
  const photos = (list || []).filter(p => !isTitle(p)).map(p => normPhoto(p, ctx));
  if (photos.length > 9) ctx.warn(`${photos.length} photos in one area – at most 9 look good`);
  const its = await Promise.all(photos.map(async p => ({ ratio: await ratioOf(p), big: !!p.big, p })));
  const { boxes, how } = pack(r, its, gap, arrange);
  boxes.forEach((b, i) => items.push(imageItem(page, b, its[i].p, area, ctx, z)));
  const worst = Math.max(0, ...boxes.map((b, i) => Math.abs(Math.log((b.w / b.h) / its[i].ratio))));
  if (worst > Math.log(1.6)) ctx.warn(`heavy crop (${how}) – try other photos or arrange:`);
  return items;
}

const T = {};
T.endpaper = async () => [];   // inside of the cover: left empty
T.blank = async () => [];

// auto: photos: [a, b, c] – arranged automatically inside the page margins. title: true = chapter title line on top.
T.auto = async (g, s, ctx) => packItems(g.side, g.content, s.photos, ctx, { area: g.trim, title: s.title, arrange: s.arrange });

// full: one photo over the whole page incl. bleed
T.full = async (g, s, ctx) => [imageItem(g.side, { ...g.trim }, normPhoto(s.photo, ctx), g.trim, ctx)];

// frames: explicit boxes in mm relative to this page's trim:
//   { photo: a, box: [x, y, w, h], border: 3, z: 2 }     one photo (border = white edge, for overlapping prints)
//   { pack: [a, b, c], box: [...], arrange: "rows 2+1" }  several photos arranged inside the box
//   { title: true, box: [...] }                           chapter title line
// A box that reaches past the page edge (x < 0 or x + w > page width) crosses the fold (layflat books only):
// it is drawn over the whole spread, on top of the other page.
T.frames = async (g, s, ctx) => {
  const out = [];
  for (const f of s.frames) {
    const [x, y, w, h] = f.box;
    const crosses = x < -EPS || x + w > g.W + EPS;
    if (crosses && !ctx.fmt.layflat) ctx.warn('a photo crosses the fold, but this book is not layflat – it will disappear into the binding');
    const page = crosses ? 'S' : g.side;
    const area = crosses ? { x: 0, y: 0, w: 2 * g.W, h: g.H } : g.trim;
    const box = { x: g.x0 + x, y, w, h };
    const z = f.z ?? (crosses ? 1 : 0);
    if (f.border) out.push({ kind: 'rect', page, box: { x: box.x - f.border, y: y - f.border, w: w + 2 * f.border, h: h + 2 * f.border }, color: f.borderColor || '#ffffff', z });
    if (f.pack) out.push(...await packItems(page, box, f.pack, ctx, { area, title: f.title, arrange: f.arrange, z }));
    else if (isTitle(f.photo || f)) out.push(titleItem(page, box, ctx, z));
    else out.push(imageItem(page, box, normPhoto(f.photo, ctx), area, ctx, z));
  }
  return out;
};

export async function layoutSpread(spread, ctx) {
  const { fmt, style } = ctx;
  const items = [], warnings = [];
  ctx.warn = (m) => warnings.push(m);
  ctx.used = [];
  const bg = (side, color) => {
    if (!color || color === 'white') return;
    const area = side === 'S' ? { x: 0, y: 0, w: 2 * fmt.pageW, h: fmt.pageH } : pageGeom(fmt, style, side).trim;
    items.push({ kind: 'rect', page: side, box: withBleed(area, area, fmt.bleed), color: style.colors[color] || color, z: -1 });
  };
  if (spread.spread) {
    // one photo over both pages (layflat)
    const s = spread.spread;
    if (!fmt.layflat) warnings.push('one photo over both pages, but this book is not layflat – the middle disappears into the binding');
    bg('S', s.bg);
    const area = { x: 0, y: 0, w: 2 * fmt.pageW, h: fmt.pageH };
    items.push(imageItem('S', area, normPhoto(s.photo, ctx), area, ctx));
    if (s.title) items.push(titleItem('S', { x: style.margin.outer + 6, y: style.margin.top + 6, w: fmt.pageW - 2 * style.margin.outer, h: style.titleLine?.height ?? 14 }, { ...ctx, chapter: { ...ctx.chapter, onPhoto: true } }, 2));
  } else {
    for (const side of ['L', 'R']) {
      const s = spread[side === 'L' ? 'left' : 'right'];
      if (!s) continue;
      const g = pageGeom(fmt, style, side, s);
      bg(side, s.bg || (s.template === 'endpaper' ? style.endpaper : null));
      const tpl = s.template || (s.frames ? 'frames' : s.photos ? 'auto' : s.photo ? 'full' : 'blank');
      if (!T[tpl]) throw new Error(`Unknown template "${tpl}" in spread ${spread.id}`);
      // a page can belong to another chapter than its spread (e.g. a chapter that starts on a right page)
      const pctx = s.chapter && ctx.chapters?.[s.chapter] ? Object.assign(Object.create(ctx), { chapter: ctx.chapters[s.chapter], folders: ctx.chapters[s.chapter].folders || [] }) : ctx;
      items.push(...await T[tpl](g, s, pctx));
    }
  }
  // stacking: background, page items, photos crossing the fold, then anything with a higher z (overlapping prints)
  const ordered = items.map((it, i) => [it, i]).sort((a, b) => (a[0].z || 0) - (b[0].z || 0) || a[1] - b[1]).map(([it]) => it);
  return { items: ordered, warnings, used: ctx.used };
}
