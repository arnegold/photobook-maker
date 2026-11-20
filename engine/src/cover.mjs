// Cover layout. Origin = top-left of the BACK cover trim. Trim width = back board + spine + front board.
// The spine and hinge grow with the page count (from the printer format).
import { resolveSrc } from './photos.mjs';
import { coverFor } from './formats.mjs';

export function coverGeom(fmt, pages) {
  const c = fmt.cover, g = coverFor(fmt, pages);
  return { H: c.height, wrapX: c.wrapX, wrapY: c.wrapY, W: g.board, spine: g.spine, hinge: g.hinge, pagesUsed: g.pagesUsed, total: { x: 0, y: 0, w: g.trimW, h: c.height }, front: g.board + g.spine };
}

const photoRef = (p) => {
  const o = typeof p === 'string' ? { src: p } : { ...p };
  o.rel = resolveSrc(String(o.src)); o.focus = o.focus || [0.5, 0.5]; o.zoom = o.zoom || 1;
  return o;
};

// cover:
//   bg: white | paper | ink | "#hex"
//   front: { photo }            photo over the whole front (from the spine to the outer edge)
//   back:  { photo }            optional photo on the back
//   inset: { side, top, bottom } photos smaller, the background colour shows around them
//   title: { text, sub, line, x, y, align: left|center, color, size, subSize }
//   spine: "TEXT ON THE SPINE"   (only drawn when the spine is at least 6 mm wide)
export async function layoutCover(cv, ctx, pages) {
  const { fmt, style } = ctx;
  const g = coverGeom(fmt, pages);
  const c = style.colors, wx = g.wrapX, wy = g.wrapY;
  const items = [];
  items.push({ kind: 'rect', page: 'C', box: { x: -wx, y: -wy, w: g.total.w + 2 * wx, h: g.H + 2 * wy }, color: c[cv.bg] || cv.bg || c.paper });
  const ins = cv.inset, inner = ins ? Math.max(ins.side, g.hinge + 4) : 0;
  if (cv.front?.photo) {
    const box = ins ? { x: g.front + inner, y: ins.top, w: g.W - inner - ins.side, h: g.H - ins.top - ins.bottom } : { x: g.front, y: -wy, w: g.W + wx, h: g.H + 2 * wy };
    items.push({ kind: 'image', page: 'C', box, fill: box, photo: photoRef(cv.front.photo) });
  }
  if (cv.back?.photo) {
    const box = ins ? { x: ins.side, y: ins.top, w: g.W - inner - ins.side, h: g.H - ins.top - ins.bottom } : { x: -wx, y: -wy, w: g.W + wx, h: g.H + 2 * wy };
    items.push({ kind: 'image', page: 'C', box, fill: box, photo: photoRef(cv.back.photo) });
  }
  const t = cv.title;
  if (t?.text) {
    const safe = Math.max(fmt.safe, 10);
    const centre = ins ? g.front + (inner + g.W - ins.side) / 2 : g.front + (g.hinge + g.W) / 2;
    const tx = t.align === 'center' ? centre : g.front + Math.max(t.x ?? 22, g.hinge + safe);
    const al = t.align === 'center' ? { align: 'center' } : {};
    const col = t.color || 'ink';
    let y = Math.max(t.y ?? 30, safe + 10);
    const main = { ...style.type.coverTitle, ...(t.size ? { size: t.size } : {}) };
    items.push({ kind: 'text', page: 'C', x: tx, y, text: t.text, ...main, color: col, ...al });
    if (t.sub) {
      const sub = { ...style.type.coverSub, ...(t.subSize ? { size: t.subSize } : {}) };
      y += sub.gap + sub.size * 0.3528;
      items.push({ kind: 'text', page: 'C', x: tx, y, text: t.sub, ...sub, color: col, ...al });
    }
    if (t.line) { y += style.type.dateLine.gap + 3; items.push({ kind: 'text', page: 'C', x: tx, y, text: t.line, ...style.type.dateLine, color: t.lineColor || col, ...al }); }
  }
  if (cv.spine && g.spine >= 6) {
    const sp = { ...style.type.spine };
    sp.size = Math.min(sp.size, g.spine * 0.55 / 0.3528);       // text must fit across the spine
    items.push({ kind: 'spine', page: 'C', x: g.W + g.spine / 2, y: g.H / 2, text: cv.spine, ...sp, ...(cv.spineColor ? { color: c[cv.spineColor] || cv.spineColor } : {}) });
  }
  if (cv.spineBg) items.splice(1, 0, { kind: 'rect', page: 'C', box: { x: g.W, y: -wy, w: g.spine, h: g.H + 2 * wy }, color: c[cv.spineBg] || cv.spineBg });
  return { items, g };
}
