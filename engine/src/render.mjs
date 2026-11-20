// Render a book to previews (default) or print files (--print).
//   photobook render                  previews of the cover + all spreads, contact sheet, Book preview.pdf, resolution report
//   photobook render --only 3,rome-2  only these spreads (number or id); "cover" for the cover
//   photobook render --proof          previews with bleed, trim (blue) and safe area (pink) drawn
//   photobook render --print          print files in out/print/ (PDFs, or page images for services with their own editor)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import * as mupdf from 'mupdf';
import sharp from 'sharp';
import { layoutSpread } from './layout.mjs';
import { layoutCover } from './cover.mjs';
import { cropFor } from './photos.mjs';
import { ENGINE, fontPath } from './workspace.mjs';
import { withDefaults } from './style.mjs';
import { printedPages, pageCountOk } from './formats.mjs';

const pt = (mm) => mm * 72 / 25.4;
const tag = (n) => 'S' + String(n).padStart(2, '0');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// short code printed on preview photos so people can name a picture ("swap 1234 and 1250")
export const codeOf = (rel) => { const s = path.basename(rel).replace(/\.[^.]+$/, ''); const d = s.match(/(\d{3,})(?!.*\d)/); return d ? d[1].slice(-4) : s.slice(0, 10); };

export async function render(ws, args = []) {
  const PRINT = args.includes('--print'), PROOF = args.includes('--proof');
  const onlyArg = args.includes('--only') ? String(args[args.indexOf('--only') + 1]).split(',') : null;
  const { book, fmt } = ws;
  const style = withDefaults(book.style);
  const colors = style.colors;
  const col = (c) => colors[c] || c;
  const codeHash = crypto.createHash('sha1').update(fs.readdirSync(path.join(ENGINE, 'src')).map(f => fs.readFileSync(path.join(ENGINE, 'src', f))).join('')).digest('hex');
  const PREV = path.join(ws.out, PROOF ? 'proof' : 'preview');
  fs.mkdirSync(PREV, { recursive: true });
  const report = [];

  // ---------- drawing ----------
  const newDoc = () => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: book.title || 'Photo book', Creator: 'photobook-maker' }, pdfVersion: fmt.pdfVersion || '1.6' });
    for (const [name, file] of Object.entries(style.fonts)) doc.registerFont(name, fontPath(ws, file));
    return doc;
  };
  // characters the main font cannot show (e.g. Chinese) switch to style.fonts.cjk when the book has one
  const CJK = /[⺀-鿿豈-﫿＀-￯　-〿가-힯぀-ヿ]/;
  const runsOf = (it) => {
    const out = [];
    for (const ch of Array.from(it.text)) {
      const font = CJK.test(ch) && style.fonts.cjk ? 'cjk' : it.font;
      if (out.length && out.at(-1).font === font) out.at(-1).text += ch; else out.push({ font, text: ch });
    }
    return out;
  };
  const textWidth = (doc, it) => {
    const tr = (it.tracking || 0) * it.size; let w = 0;
    for (const r of runsOf(it)) { doc.font(r.font).fontSize(it.size); w += doc.widthOfString(r.text) + tr * Array.from(r.text).length; }
    return w - tr;
  };
  const drawRuns = (doc, it, x, y) => {
    const tr = (it.tracking || 0) * it.size;
    doc.fillColor(col(it.color));
    for (const r of runsOf(it)) {
      doc.font(r.font).fontSize(it.size);
      doc.text(r.text, x, y, { lineBreak: false, baseline: 'alphabetic', characterSpacing: tr });
      x += doc.widthOfString(r.text) + tr * Array.from(r.text).length;
    }
  };
  const drawMark = (doc, X, Y, x, y, s, text) => {
    doc.rect(X(x), Y(y), pt(s), pt(s)).fill(col('accent'));
    doc.font(style.fonts.cjk && CJK.test(text) ? 'cjk' : 'text').fillColor(col('paper'));
    const fs_ = pt(s) * (Array.from(text).length > 1 ? 0.42 : 0.62); doc.fontSize(fs_);
    const w = doc.widthOfString(text);
    doc.text(text, X(x) + (pt(s) - w) / 2, Y(y) + pt(s) / 2 + fs_ * 0.36, { lineBreak: false, baseline: 'alphabetic' });
  };
  // Slim chapter title line: [mark] TITLE  subtitle ............ dates
  const drawTitleLine = (doc, it, X, Y) => {
    const st = style.titleLine, ch = it.chapter || {}, b = it.box;
    const en = { ...style.type.chapterTitle, text: ch.title || '' };
    const sub = { ...style.type.chapterSub, text: ch.subtitle || '' };
    const dt = { ...style.type.dateLine, text: ch.dates || '' };
    const markW = ch.mark ? st.mark + st.space : 0;
    if (ch.onPhoto) {   // title on a photo: put it on a paper-coloured label
      const w = Math.min(b.w, (textWidth(doc, en) + textWidth(doc, sub) + (dt.text ? textWidth(doc, dt) + pt(st.space) : 0)) / pt(1) + markW + 2 * st.space + 8);
      doc.rect(X(b.x - 4), Y(b.y), pt(w), pt(b.h)).fill(col('paper'));
      b.w = w - 8;
    } else if (st.bg && st.bg !== 'none') doc.rect(X(it.fill.x), Y(it.fill.y), pt(it.fill.w), pt(it.fill.h)).fill(col(st.bg));
    const avail = pt(b.w - markW - st.space - 4) - (dt.text ? textWidth(doc, dt) : 0);
    while (textWidth(doc, en) + textWidth(doc, sub) > avail && en.size > style.minTitle) { en.size -= 0.5; sub.size = Math.max(style.minTitle, sub.size - 0.35); }
    const capH = en.size * 0.3528 * 0.7;
    const base = b.y + b.h / 2 + capH / 2;
    let x = b.x;
    if (ch.mark) { drawMark(doc, X, Y, x, base - capH / 2 - st.mark / 2, st.mark, String(ch.mark)); x += st.mark + st.space; }
    drawRuns(doc, en, X(x), Y(base));
    x += textWidth(doc, en) / pt(1) + st.space;
    if (sub.text) drawRuns(doc, sub, X(x), Y(base));
    if (dt.text) drawRuns(doc, dt, X(b.x + b.w) - textWidth(doc, dt), Y(base));
  };

  async function drawItems(doc, items, { dx, dy, clipFor, ppi, quality, label, codes }) {
    const X = (x) => pt(x + dx), Y = (y) => pt(y + dy);
    for (const it of items) {
      const clip = clipFor(it.page);
      if (!clip) continue;
      doc.save();
      doc.rect(X(clip.x), Y(clip.y), pt(clip.w), pt(clip.h)).clip();
      if (it.kind === 'rect') doc.rect(X(it.box.x), Y(it.box.y), pt(it.box.w), pt(it.box.h)).fill(col(it.color));
      else if (it.kind === 'image') {
        const p = it.photo;
        const r = await cropFor(p.rel, it.fill, { focus: p.focus, zoom: p.zoom, grade: p.grade, folders: p.folders, targetPpi: ppi, quality });
        doc.image(r.buf, X(it.fill.x), Y(it.fill.y), { width: pt(it.fill.w), height: pt(it.fill.h) });
        if (label) report.push({ where: label, page: it.page, src: p.rel, boxMM: `${it.box.w.toFixed(0)}x${it.box.h.toFixed(0)}`, ppi: Math.round(r.ppi) });
        if (codes) {   // preview only: a small code per photo
          const code = codeOf(p.rel);
          doc.font('text').fontSize(7);
          const tw = doc.widthOfString(code);
          doc.rect(X(it.box.x) + 4, Y(it.box.y) + 4, tw + 6, 11).fill('#111111');
          doc.fillColor('#ffffff').text(code, X(it.box.x) + 7, Y(it.box.y) + 6.2, { lineBreak: false });
        }
      } else if (it.kind === 'titleblock') drawTitleLine(doc, it, X, Y);
      else if (it.kind === 'text') {
        let x = it.x;
        if (it.align === 'center') x -= textWidth(doc, it) / 2 / pt(1);
        if (it.align === 'right') x -= textWidth(doc, it) / pt(1);
        drawRuns(doc, it, X(x), Y(it.y));
      } else if (it.kind === 'spine') {
        const w = textWidth(doc, it);
        doc.translate(X(it.x), Y(it.y)).rotate(90);
        drawRuns(doc, it, -w / 2, it.size * 0.35);
      }
      doc.restore();
    }
  }

  const docBuffer = (doc) => { const chunks = []; doc.on('data', (c) => chunks.push(c)); return new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks)))); };
  const rasterize = (pdfBuf, pxWidth, pageNo = 0) => {
    const d = mupdf.Document.openDocument(pdfBuf, 'application/pdf');
    const page = d.loadPage(pageNo);
    const [x0, , x1] = page.getBounds();
    const sc = pxWidth / (x1 - x0);
    const pix = page.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
    return { png: Buffer.from(pix.asPNG()), sc };
  };
  async function labelled(png, label, sub, gutterX, warn = '') {
    const m = await sharp(png).metadata();
    const strip = warn ? 84 : 54;
    const svg = Buffer.from(`<svg width="${m.width}" height="${strip}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#2b2b2b"/>
      <text x="16" y="36" font-family="Arial" font-weight="bold" font-size="26" fill="#ffffff">${esc(label)}</text>
      <text x="${16 + label.length * 16 + 20}" y="35" font-family="Arial" font-size="20" fill="#bdbdbd">${esc(sub)}</text>${warn ? `<text x="16" y="72" font-family="Arial" font-size="19" fill="#ff7a6e">⚠ ${esc(warn.slice(0, 160))}</text>` : ''}</svg>`);
    const comp = [{ input: png, top: strip, left: 0 }, { input: svg, top: 0, left: 0 }];
    if (gutterX) comp.push({ input: Buffer.from(`<svg width="2" height="${m.height}" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="100%" fill="#000" fill-opacity="${fmt.layflat ? 0.12 : 0.35}"/></svg>`), top: strip, left: Math.round(gutterX) });
    return sharp({ create: { width: m.width, height: m.height + strip, channels: 3, background: '#2b2b2b' } }).composite(comp).jpeg({ quality: 88 }).toBuffer();
  }

  // ---------- spreads ----------
  let chapterId = null;
  const spreads = (book.spreads || []).map((s, i) => { if (s.chapter) chapterId = s.chapter; return { ...s, n: i + 1, chapterId }; });
  const tagOf = (s) => s.altTag || tag(s.n);
  const altCount = new Map();
  const alternatives = (book.alternatives || []).map(a => {
    const base = spreads.find(s => s.id === a.of);
    if (!base) throw new Error('alternative ' + a.id + ': unknown spread ' + a.of);
    const k = (altCount.get(a.of) || 0) + 1; altCount.set(a.of, k);
    return { ...a, n: base.n, chapterId: base.chapterId, altTag: tag(base.n) + 'alt' + (k > 1 ? k : '') };
  });
  const withAlts = spreads.flatMap(s => [s, ...alternatives.filter(a => a.of === s.id)]);
  const selected = (s) => !onlyArg || onlyArg.includes(String(s.n)) || onlyArg.includes(s.id) || onlyArg.includes(tagOf(s));
  const warnings = [];
  const pageCount = printedPages(fmt, spreads.length);
  if (pageCount < fmt.pages.min) warnings.push(`the book has ${pageCount} pages; ${fmt.service} needs at least ${fmt.pages.min}`);
  else if (pageCount > fmt.pages.max) warnings.push(`the book has ${pageCount} pages; ${fmt.service} allows at most ${fmt.pages.max}`);
  else if (!pageCountOk(fmt, pageCount)) warnings.push(`${fmt.service} adds pages in groups of ${fmt.pages.step} – add or remove spreads`);
  if (fmt.endpapers && spreads.length && spreads[0].left && spreads[0].left.template !== 'endpaper') warnings.push('spread 1 left page is the inside of the cover, which this service does not print: make it `template: endpaper`');
  if (fmt.endpapers && spreads.length > 1 && spreads.at(-1).right && spreads.at(-1).right.template !== 'endpaper') warnings.push('the last right page is the inside of the back cover, which this service does not print: make it `template: endpaper`');

  const ctxFor = (s) => { const ch = book.chapters?.[s.chapterId] || {}; return { fmt, style, chapter: ch, folders: ch.folders || [], chapters: book.chapters || {} }; };
  const describe = (s) => {
    const ph = (p) => typeof p === 'string' ? codeOf(p) : p?.src ? codeOf(String(p.src)) : '';
    const d = (pg) => {
      if (!pg) return '-';
      if (pg.template === 'endpaper') return 'inside cover';
      const list = pg.photos ? pg.photos.map(ph) : pg.photo ? [ph(pg.photo)] : pg.frames ? pg.frames.flatMap(f => f.pack ? f.pack.map(ph) : [ph(f.photo)]) : [];
      return list.filter(Boolean).join(' ');
    };
    return s.spread ? `over both pages: ${d(s.spread)}` : `L: ${d(s.left)}   |   R: ${d(s.right)}`;
  };
  const W = fmt.pageW, H = fmt.pageH, b = fmt.bleed;
  const spreadClip = (page) => page === 'L' ? { x: -b, y: -b, w: W + b, h: H + 2 * b } : page === 'R' ? { x: W, y: -b, w: W + b, h: H + 2 * b } : { x: -b, y: -b, w: 2 * W + 2 * b, h: H + 2 * b };

  async function previewSpread(s) {
    const ctx = ctxFor(s);
    const hash = crypto.createHash('sha1').update(JSON.stringify([s, ctx.chapter, fmt, style, codeHash, PROOF, ws.photos])).digest('hex').slice(0, 10);
    const file = path.join(PREV, `${tagOf(s)}_${s.id}.jpg`);
    const { items, warnings: w } = await layoutSpread(s, ctx);
    warnings.push(...w.map(x => `${tagOf(s)} ${s.id}: ${x}`));
    if (!PROOF && fs.existsSync(file) && fs.existsSync(file + '.hash') && fs.readFileSync(file + '.hash', 'utf8') === hash) {
      for (const it of items.filter(i => i.kind === 'image')) {
        const r = await cropFor(it.photo.rel, it.fill, { focus: it.photo.focus, zoom: it.photo.zoom, grade: it.photo.grade, folders: it.photo.folders, targetPpi: 150, quality: 82 });
        report.push({ where: tagOf(s) + ' ' + s.id, page: it.page, src: it.photo.rel, boxMM: `${it.box.w.toFixed(0)}x${it.box.h.toFixed(0)}`, ppi: Math.round(r.ppi) });
      }
      return file;
    }
    const doc = newDoc(), bufP = docBuffer(doc);
    doc.addPage({ size: [pt(2 * W + 2 * b), pt(H + 2 * b)] });
    doc.rect(0, 0, pt(2 * W + 2 * b), pt(H + 2 * b)).fill('#ffffff');
    await drawItems(doc, items, { dx: b, dy: b, clipFor: spreadClip, ppi: 150, quality: 82, label: tagOf(s) + ' ' + s.id, codes: style.previewCodes !== false });
    if (PROOF) proofMarks(doc, [{ x: 0, y: 0, w: W, h: H }, { x: W, y: 0, w: W, h: H }], b);
    doc.end();
    const pdf = await bufP;
    const pxW = 2000, fullW = PROOF ? pxW : Math.round(pxW * (2 * W + 2 * b) / (2 * W));
    const { png, sc } = rasterize(pdf, fullW);
    let img = png;
    if (!PROOF) { const bp = Math.round(pt(b) * sc); img = await sharp(png).extract({ left: bp, top: bp, width: Math.round(pt(2 * W) * sc), height: Math.round(pt(H) * sc) }).png().toBuffer(); }
    const out = await labelled(img, `${tagOf(s)}  ${s.id}`, s.note || describe(s), PROOF ? null : pt(W) * sc, w.join(' · '));
    fs.writeFileSync(file, out); fs.writeFileSync(file + '.hash', hash);
    return file;
  }
  function proofMarks(doc, areas, b) {
    doc.save().lineWidth(0.4);
    for (const a of areas) {
      doc.rect(pt(a.x + b), pt(a.y + b), pt(a.w), pt(a.h)).strokeColor('#00a0ff').stroke();
      const s = fmt.safe;
      doc.rect(pt(a.x + b + s), pt(a.y + b + s), pt(a.w - 2 * s), pt(a.h - 2 * s)).dash(2, { space: 2 }).strokeColor('#ff00aa').stroke().undash();
    }
    doc.restore();
  }

  // ---------- cover ----------
  async function renderCover(print) {
    const cv = book.cover || {};
    const { items, g } = await layoutCover(cv, { fmt, style }, Math.max(pageCount, fmt.pages.min));
    const wx = g.wrapX, wy = g.wrapY;
    const doc = newDoc(), bufP = docBuffer(doc);
    doc.addPage({ size: [pt(g.total.w + 2 * wx), pt(g.H + 2 * wy)] });
    await drawItems(doc, items, { dx: wx, dy: wy, clipFor: () => ({ x: -wx, y: -wy, w: g.total.w + 2 * wx, h: g.H + 2 * wy }), ppi: print ? 300 : 150, quality: print ? 95 : 82, label: 'C00 cover' });
    if (PROOF && !print) {
      doc.save().lineWidth(0.5);
      for (const x of [g.W - g.hinge, g.W, g.W + g.spine, g.W + g.spine + g.hinge]) doc.moveTo(pt(x + wx), 0).lineTo(pt(x + wx), pt(g.H + 2 * wy)).dash(3, { space: 2 }).strokeColor('#00a0ff').stroke();
      doc.undash().rect(pt(wx), pt(wy), pt(g.total.w), pt(g.H)).strokeColor('#00a0ff').stroke();
      doc.restore();
    }
    doc.end();
    const pdf = await bufP;
    if (print) return pdf;
    const pxW = 2000, fullW = PROOF ? pxW : Math.round(pxW * (g.total.w + 2 * wx) / g.total.w);
    const { png, sc } = rasterize(pdf, fullW);
    let img = png;
    if (!PROOF) {
      img = await sharp(png).extract({ left: Math.round(pt(wx) * sc), top: Math.round(pt(wy) * sc), width: Math.round(pt(g.total.w) * sc), height: Math.round(pt(g.H) * sc) })
        .composite([g.W, g.W + g.spine].map(x => ({ input: Buffer.from(`<svg width="1" height="${Math.round(pt(g.H) * sc)}" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="100%" fill="#000" fill-opacity="0.15"/></svg>`), top: 0, left: Math.round(pt(x) * sc) })))
        .png().toBuffer();
    }
    const file = path.join(PREV, 'C00_cover.jpg');
    fs.writeFileSync(file, await labelled(img, 'C00  cover', `back | spine ${g.spine} mm for ${g.pagesUsed} pages | front   (${fmt.verified ? 'printer template values' : 'PROVISIONAL sizes'})`));
    return file;
  }

  // ---------- print ----------
  async function renderPrint() {
    const dir = path.join(ws.out, 'print');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const doc = newDoc(), bufP = docBuffer(doc);
    for (const s of spreads) {
      const { items, warnings: w } = await layoutSpread(s, ctxFor(s));
      warnings.push(...w.map(x => `${tag(s.n)} ${s.id}: ${x}`));
      const label = tag(s.n) + ' ' + s.id;
      if (fmt.contentExport === 'spreads') {
        doc.addPage({ size: [pt(2 * W + 2 * b), pt(H + 2 * b)] });
        await drawItems(doc, items, { dx: b, dy: b, clipFor: spreadClip, ppi: 300, quality: 95, label });
      } else {
        // single pages. With endpapers the inside covers are not part of the upload.
        for (const side of ['L', 'R']) {
          const pg = s[side === 'L' ? 'left' : 'right'];
          if (fmt.endpapers && pg?.template === 'endpaper' && ((side === 'L' && s.n === 1) || (side === 'R' && s.n === spreads.length))) continue;
          const x0 = side === 'L' ? 0 : W;
          doc.addPage({ size: [pt(W + 2 * b), pt(H + 2 * b)] });
          const area = { x: x0 - b, y: -b, w: W + 2 * b, h: H + 2 * b };
          await drawItems(doc, items, { dx: b - x0, dy: b, clipFor: (page) => (page === side || page === 'S') ? area : null, ppi: 300, quality: 95, label: side === 'L' ? label : null });
        }
      }
    }
    doc.end();
    const content = await bufP, cover = await renderCover(true);
    const files = [];
    if (fmt.upload === 'images') {
      // one 300 ppi JPG per PDF page, to place full-bleed in the service's own editor
      const d = mupdf.Document.openDocument(content, 'application/pdf');
      for (let i = 0; i < d.countPages(); i++) {
        const page = d.loadPage(i), sc = 300 / 72;
        const pix = page.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
        const f = path.join(dir, `page-${String(i + 1).padStart(3, '0')}.jpg`);
        await sharp(Buffer.from(pix.asPNG())).withMetadata({ density: 300 }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(f);
        files.push(f);
      }
      const cd = mupdf.Document.openDocument(cover, 'application/pdf').loadPage(0), sc = 300 / 72;
      const f = path.join(dir, 'cover.jpg');
      await sharp(Buffer.from(cd.toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true).asPNG())).withMetadata({ density: 300 }).jpeg({ quality: 95 }).toFile(f);
      files.push(f);
    } else {
      fs.writeFileSync(path.join(dir, 'content.pdf'), content);
      fs.writeFileSync(path.join(dir, 'cover.pdf'), cover);
      files.push(path.join(dir, 'content.pdf'), path.join(dir, 'cover.pdf'));
    }
    // to look through: cover first, then all pages (not for upload)
    const all = new mupdf.PDFDocument();
    for (const buf of [cover, content]) { const src = mupdf.Document.openDocument(buf, 'application/pdf').asPDF(); for (let i = 0; i < src.countPages(); i++) all.graftPage(-1, src, i); }
    fs.writeFileSync(path.join(dir, 'book-with-cover (view only).pdf'), all.saveToBuffer('compress').asUint8Array());
    return files;
  }

  // ---------- main ----------
  const result = { files: [], warnings, pages: pageCount, spreads: spreads.length };
  if (PRINT) {
    result.files = await renderPrint();
  } else {
    if (!onlyArg || onlyArg.includes('cover')) result.files.push(await renderCover(false));
    for (const s of withAlts) if (selected(s)) result.files.push(await previewSpread(s));
    const keep = new Set(withAlts.map(s => `${tagOf(s)}_${s.id}.jpg`));
    for (const f of fs.readdirSync(PREV)) { const base = f.replace(/\.hash$/, ''); if (/^S\d\d(alt\d*)?_.*\.jpg$/.test(base) && !keep.has(base)) fs.unlinkSync(path.join(PREV, f)); }
    const all = [path.join(PREV, 'C00_cover.jpg'), ...withAlts.map(s => path.join(PREV, `${tagOf(s)}_${s.id}.jpg`))].filter(f => fs.existsSync(f));
    if (all.length) {
      const TW = 640, COLS = 3;
      const thumbs = await Promise.all(all.map(f => sharp(f).resize(TW).toBuffer({ resolveWithObject: true })));
      const rowH = Math.max(...thumbs.map(t => t.info.height)) + 24;
      await sharp({ create: { width: COLS * TW + (COLS + 1) * 24, height: Math.ceil(thumbs.length / COLS) * rowH + 24, channels: 3, background: '#e9e7e2' } })
        .composite(thumbs.map((t, i) => ({ input: t.data, left: 24 + (i % COLS) * (TW + 24), top: 24 + Math.floor(i / COLS) * rowH }))).jpeg({ quality: 85 }).toFile(path.join(PREV, 'contact-sheet.jpg'));
      // flip-through PDF: cover + one spread per page (opens on any phone)
      const flip = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: (book.title || 'Photo book') + ' – preview' } });
      const flipP = docBuffer(flip);
      for (const f of all) { const m = await sharp(f).metadata(); const w = 842, h = Math.round(842 * m.height / m.width); flip.addPage({ size: [w, h] }); flip.image(fs.readFileSync(f), 0, 0, { width: w, height: h }); }
      flip.end();
      fs.writeFileSync(path.join(ws.out, 'Book preview.pdf'), await flipP);
    }
  }
  // ---------- resolution report ----------
  const lines = ['| where | page | photo | box mm | effective ppi | flag |', '|---|---|---|---|---|---|'];
  for (const r of report) lines.push(`| ${r.where} | ${r.page} | ${r.src} | ${r.boxMM} | ${r.ppi} | ${r.ppi < 200 ? 'LOW (<200)' : r.ppi < 300 ? 'ok (<300)' : ''} |`);
  fs.writeFileSync(path.join(ws.out, 'resolution-report.md'), `# Resolution at printed size\nFormat: ${fmt.service} – ${fmt.product}${fmt.verified ? '' : ' (PROVISIONAL sizes)'}\n\n200 ppi and up prints sharp; below 200 can look soft; below 150 make the photo smaller.\n\n${lines.join('\n')}\n`);
  result.low = report.filter(r => r.ppi < 200);
  return result;
}
