// The picking and review page: every photo per chapter (✓ / ? / ✗ + a note), the current spreads (a note per spread)
// and Claude's questions. Built into out/review/; served by server.mjs, which saves everything in feedback.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ENGINE, readJSON, loadQuestions } from './workspace.mjs';
import { photosByChapter } from './bookfile.mjs';
import { layoutSpread } from './layout.mjs';
import { abs } from './photos.mjs';
import { withDefaults } from './style.mjs';
import { codeOf } from './render.mjs';

const thumbName = (rel) => crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16) + '.jpg';

export async function buildReview(ws, { log = () => {} } = {}) {
  const { book, fmt } = ws;
  const style = withDefaults(book.style);
  const rows = readJSON(path.join(ws.cache, 'inventory.json'), null);
  if (!rows) throw new Error('Run "photobook scan" first.');
  const THUMBS = path.join(ws.cache, 'thumbs');
  fs.mkdirSync(THUMBS, { recursive: true });

  // where each photo is used, and the spreads per chapter
  const usedOn = new Map(), spreadsOf = new Map();
  let cur = null;
  for (const [i, s] of (book.spreads || []).entries()) {
    if (s.chapter) cur = s.chapter;
    const tag = 'S' + String(i + 1).padStart(2, '0');
    const ch = book.chapters?.[cur] || {};
    try {
      const { items } = await layoutSpread(s, { fmt, style, chapter: ch, folders: ch.folders || [], chapters: book.chapters || {} });
      for (const it of items) if (it.kind === 'image' && !usedOn.has(it.photo.rel)) usedOn.set(it.photo.rel, tag);
    } catch (e) { log(`  ${tag}: ${e.message}`); }
    const img = path.join(ws.out, 'preview', `${tag}_${s.id}.jpg`);
    if (!spreadsOf.has(cur)) spreadsOf.set(cur, []);
    spreadsOf.get(cur).push({ tag, id: s.id, img: fs.existsSync(img) ? `preview/${tag}_${s.id}.jpg` : null });
    for (const [k, a] of (book.alternatives || []).filter(a => a.of === s.id).entries()) {
      const at = tag + 'alt' + (k ? k + 1 : ''), ai = path.join(ws.out, 'preview', `${at}_${a.id}.jpg`);
      spreadsOf.get(cur).push({ tag: at, id: a.id, alt: true, img: fs.existsSync(ai) ? `preview/${at}_${a.id}.jpg` : null });
    }
  }

  const byCh = photosByChapter(book, rows);
  const chapterIds = [...Object.keys(book.chapters || {}), ...(byCh._none.length ? ['_none'] : [])];
  const chapters = [];
  let made = 0;
  for (const id of chapterIds) {
    const c = id === '_none' ? { title: 'Not in a chapter' } : book.chapters[id];
    const photos = [];
    for (const r of byCh[id].filter(r => !r.missing)) {
      const t = thumbName(r.file), tp = path.join(THUMBS, t);
      if (!fs.existsSync(tp) || fs.statSync(tp).mtimeMs < r.mtime) {
        await sharp(abs(r.file)).rotate().resize(1000, 1000, { fit: 'inside' }).jpeg({ quality: 72 }).toFile(tp);
        if (++made % 50 === 0) log(`  thumbnails: ${made}`);
      }
      photos.push({ key: r.file, code: codeOf(r.file), name: path.basename(r.file), thumb: `thumbs/${t}`, taken: r.taken, burst: r.burst, used: usedOn.get(r.file) || '', small: r.maxPrintCm < 15, ratio: r.ratio });
    }
    chapters.push({ id, title: c.title || id, subtitle: c.subtitle || '', dates: c.dates || '', photos, spreads: spreadsOf.get(id) || [] });
  }
  const cover = fs.existsSync(path.join(ws.out, 'preview', 'C00_cover.jpg')) ? 'preview/C00_cover.jpg' : null;
  const data = {
    title: book.title || 'Photo book', format: `${fmt.service} – ${fmt.product}`, layflat: !!fmt.layflat,
    pages: (book.spreads || []).length * 2, cover, chapters, questions: loadQuestions(ws),
    built: new Date().toISOString(),
  };
  const OUT = path.join(ws.out, 'review');
  fs.mkdirSync(OUT, { recursive: true });
  const tpl = fs.readFileSync(path.join(ENGINE, 'src', 'review-template.html'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'index.html'), tpl.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c')));
  return { chapters: chapters.map(c => ({ id: c.id, title: c.title, photos: c.photos.length, spreads: c.spreads.length })), questions: data.questions.length };
}
