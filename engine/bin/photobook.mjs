#!/usr/bin/env node
// photobook – make a print photo book from a folder of photos.
// Every command works on one book folder: --book "<folder>" (default: the current folder).
//
//   photobook doctor                        check that everything needed is installed
//   photobook formats [--json]              printing services and book sizes
//   photobook new "<book folder>" --photos "<photo folder>" --format <id> [--title "..."] [--layflat yes|no]
//   photobook scan                          read dates, places and cameras of all photos; suggest chapters
//   photobook chapters [--apply]            show chapters (--apply: take the suggested ones into book.yaml)
//   photobook review [--serve] [--open]     build the picking/review page (--serve: start it on this computer)
//   photobook feedback [--json]             what people marked and wrote on the review page
//   photobook done <note id> "<what you did>" ...   file handled notes away
//   photobook layout [--per-page 3] [--pages 40]    design all spreads from the picked photos (book.yaml)
//   photobook render [--only 3,ch1-2] [--proof]     previews in out/preview + out/Book preview.pdf
//   photobook print                         print files in out/print + checks
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const cmd = args.shift() || 'help';
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; const has = v !== undefined && !v.startsWith('--'); args.splice(i, has ? 2 : 1); return has ? v : true; };
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 1));
const ENGINE = path.resolve(import.meta.dirname, '..');

async function doctor() {
  const [maj] = process.versions.node.split('.').map(Number);
  const res = { node: process.versions.node, nodeOk: maj >= 20, missing: [] };
  for (const m of ['sharp', 'pdfkit', 'mupdf', 'js-yaml', 'exifr']) { try { await import(m); } catch { res.missing.push(m); } }
  res.fonts = fs.existsSync(path.join(ENGINE, 'fonts', 'Jost-400.ttf'));
  res.ok = res.nodeOk && !res.missing.length && res.fonts;
  if (!res.nodeOk) res.fix = 'Install Node.js 20 or newer (LTS) from https://nodejs.org';
  else if (res.missing.length) res.fix = `Run: npm ci --omit=dev   (in ${ENGINE})`;
  return res;
}

try {
  if (cmd === 'doctor') { const r = await doctor(); out(r); process.exit(r.ok ? 0 : 1); }
  if (cmd === 'help' || cmd === '--help') { out(fs.readFileSync(import.meta.filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(0); }

  const { formats, describeFormat } = await import('../src/formats.mjs');
  if (cmd === 'formats') {
    if (flag('--json')) out(Object.fromEntries(Object.entries(formats).map(([id, f]) => [id, { service: f.service, product: f.product, pageW: f.pageW, pageH: f.pageH, bleed: f.bleed, layflat: f.layflat, pages: f.pages, upload: f.upload, verified: f.verified, url: f.url, notes: f.notes }])));
    else out(Object.entries(formats).map(([id, f]) => describeFormat(id, f)).join('\n'));
    process.exit(0);
  }

  const ws_ = await import('../src/workspace.mjs');
  if (cmd === 'new') {
    const dir = path.resolve(args.shift() || '.');
    const photos = flag('--photos'), format = flag('--format') || 'saal-21x28', title = flag('--title') || path.basename(dir);
    if (!photos || !fs.existsSync(photos)) throw new Error('--photos "<folder with your photos>" is needed and must exist');
    if (!formats[format]) throw new Error(`Unknown format ${format}. See: photobook formats`);
    if (fs.existsSync(path.join(dir, 'book.yaml')) && !flag('--force')) throw new Error(`${dir} already has a book.yaml (use another folder, or --force to start over)`);
    const photosAbs = path.resolve(photos);
    if (dir.toLowerCase().startsWith(photosAbs.toLowerCase() + path.sep)) console.error('Note: the book folder is inside the photo folder. That works (it is skipped when scanning), but a separate folder is tidier.');
    fs.mkdirSync(dir, { recursive: true });
    const book = { title, photos: photosAbs, format };
    const lf = flag('--layflat');
    if (lf !== undefined) book.formatOverrides = { layflat: /^(yes|true|1)$/i.test(String(lf)) };
    const pp = flag('--per-page'); if (pp) book.layout = { perPage: +pp };
    const pages = flag('--pages'); if (pages) book.pages = +pages;
    book.style = {}; book.cover = {}; book.chapters = {}; book.spreads = [];
    const { bookText } = await import('../src/bookfile.mjs');
    fs.writeFileSync(path.join(dir, 'book.yaml'), bookText(book));
    fs.writeFileSync(path.join(dir, 'questions.yaml'), '# Questions shown on the review page (Questions tab). Answers land in feedback.json.\n# - { id: q1, text: "Which cover photo?", options: [A, B] }\n[]\n');
    out({ created: dir, format, photos: photosAbs });
    process.exit(0);
  }

  const dir = ws_.bookDirFromArgs(args);
  const ws = ws_.openBook(dir);
  const { readJSON } = ws_;
  const inv = () => readJSON(path.join(ws.cache, 'inventory.json'), null);

  if (cmd === 'scan') {
    const { scan } = await import('../src/scan.mjs');
    const opts = { log: (m) => console.error(m) };
    const g = flag('--gap-hours'); if (g) opts.gapHours = +g;
    const by = flag('--by'); if (by) opts.by = by;
    const r = await scan(ws, opts);
    out({ summary: r.summary, unsupported: r.unsupported.length ? { count: r.unsupported.length, examples: r.unsupported.slice(0, 5), why: 'HEIC/RAW files cannot be read: export them as JPEG first' } : undefined,
      suggestedChapters: r.chapters.map(c => ({ id: c.id, dates: c.dates, photos: c.photos, from: c.from, to: c.to, centre: c.centre, folders: c.folders.slice(0, 5) })) });
  } else if (cmd === 'chapters') {
    const { photosByChapter, writeBook } = await import('../src/bookfile.mjs');
    const rows = inv(); if (!rows) throw new Error('Run "photobook scan" first');
    if (flag('--apply')) {
      if (Object.keys(ws.book.chapters || {}).length && !flag('--force')) throw new Error('book.yaml already has chapters (add --force to replace them)');
      const { suggestChapters } = await import('../src/scan.mjs');
      const sug = suggestChapters(rows, { by: flag('--by') || 'time', ...(flag('--gap-hours') ? { gapHours: +flag('--gap-hours') } : {}) });
      const pad = (t) => t.length === 16 ? t + ':00' : t;
      ws.book.chapters = Object.fromEntries(sug.map(c => [c.id, { title: c.title.toUpperCase(), subtitle: '', dates: c.dates, from: pad(c.from), to: pad(c.to) }]));
      writeBook(ws, ws.book);
    }
    const by = photosByChapter(ws.book, rows);
    out(Object.entries(by).filter(([id, l]) => id !== '_none' || l.length).map(([id, l]) => ({ id, title: ws.book.chapters?.[id]?.title || 'NOT IN A CHAPTER', photos: l.length, first: l[0]?.file, last: l.at(-1)?.file })));
  } else if (cmd === 'review') {
    const { buildReview } = await import('../src/review.mjs');
    const r = await buildReview(ws, { log: (m) => console.error(m) });
    if (flag('--serve')) {
      const { serve } = await import('../src/server.mjs');
      const link = await serve(ws, { port: +(flag('--port') || 4747), open: !!flag('--open') });
      out({ ...r, url: link, note: 'Keep this running while people use the page. Stop it with Ctrl+C.' });
    } else out(r);
  } else if (cmd === 'serve') {
    const { serve } = await import('../src/server.mjs');
    out({ url: await serve(ws, { port: +(flag('--port') || 4747), open: !!flag('--open') }) });
  } else if (cmd === 'feedback') {
    const { feedbackReport } = await import('../src/feedback.mjs');
    out(feedbackReport(ws, inv()));
  } else if (cmd === 'done') {
    const { markDone } = await import('../src/feedback.mjs');
    const pairs = []; for (let i = 0; i < args.length; i += 2) pairs.push({ id: args[i], what: args[i + 1] });
    out({ filed: markDone(ws, pairs) });
  } else if (cmd === 'layout') {
    const { autolayout } = await import('../src/autolayout.mjs');
    const { writeBook } = await import('../src/bookfile.mjs');
    const rows = inv(); if (!rows) throw new Error('Run "photobook scan" first');
    if ((ws.book.spreads || []).length && !flag('--force')) throw new Error('book.yaml already has spreads. "photobook layout --force" replaces ALL of them (the old version is kept in cache/history).');
    const pp = flag('--per-page'), pages = flag('--pages');
    const r = autolayout(ws, rows, ws_.loadFeedback(ws).marks, { perPage: pp ? +pp : undefined, pages: pages ? +pages : undefined });
    ws.book.spreads = r.spreads; ws.book.cover = r.cover;
    writeBook(ws, ws.book);
    out({ spreads: r.spreads.length, pages: r.pages, notes: r.notes });
  } else if (cmd === 'render' || cmd === 'print') {
    const { render } = await import('../src/render.mjs');
    const r = await render(ws, cmd === 'print' ? ['--print', ...args] : args);
    const res = { pages: r.pages, spreads: r.spreads, warnings: r.warnings, lowResolution: r.low.map(l => `${l.where} ${l.page} ${l.src} ${l.ppi} ppi`) };
    if (cmd === 'print') {
      const { checkPdf } = await import('../src/checkpdf.mjs');
      res.files = r.files.map(f => path.relative(ws.dir, f));
      res.checks = r.files.filter(f => f.endsWith('.pdf')).map(checkPdf);
      res.verified = !!ws.fmt.verified;
      if (!ws.fmt.verified) res.WARNING = 'The format sizes are PROVISIONAL. Put the exact numbers from the printer\'s template in formatOverrides (book.yaml) before uploading.';
    } else res.preview = path.join(ws.out, 'Book preview.pdf');
    out(res);
  } else throw new Error(`Unknown command "${cmd}". Try: photobook help`);
} catch (e) {
  console.error('ERROR: ' + e.message);
  if (process.env.PHOTOBOOK_DEBUG) console.error(e.stack);
  process.exit(1);
}
