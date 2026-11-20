// End-to-end test on fake photos: new book -> scan -> chapters -> pick -> layout -> render -> review page -> print.
// Runs once for a layflat book (Saal 21x28, PDF spreads) and once for a normal book (Blurb 8x10, PDF pages)
// and once for an online-editor service (page images).   node engine/test/e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import * as yaml from 'js-yaml';
import { bookText } from '../src/bookfile.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CLI = path.join(ROOT, 'engine', 'bin', 'photobook.mjs');
const PHOTOS = path.join(import.meta.dirname, 'sample-photos');
const run = (...a) => JSON.parse(execFileSync(process.execPath, [CLI, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) fails++; };

if (!fs.existsSync(PHOTOS)) execFileSync(process.execPath, [path.join(import.meta.dirname, 'make-sample.mjs')], { stdio: 'inherit' });
const before = fs.readdirSync(path.join(PHOTOS, 'Camera')).map(f => fs.statSync(path.join(PHOTOS, 'Camera', f)).mtimeMs).join();

for (const format of ['saal-21x28', 'blurb-standard-portrait', 'editor-images']) {
  console.log(`\n== ${format}`);
  const B = path.join(import.meta.dirname, 'sample-book', format);
  fs.rmSync(B, { recursive: true, force: true });
  run('new', B, '--photos', PHOTOS, '--format', format, '--title', 'Portugal 2026');
  const sc = run('scan', '--book', B);
  ok(sc.summary.photos === 78 && sc.unsupported.count === 1, `scan: ${sc.summary.photos} photos, ${sc.unsupported.count} HEIC flagged, ${sc.suggestedChapters.length} chapters suggested`);
  const ch = run('chapters', '--apply', '--by', 'place', '--book', B);
  ok(ch.length === 3, `chapters by place: ${ch.map(c => c.photos).join(' / ')} photos`);

  // what Claude does after the interview: name the chapters
  const file = path.join(B, 'book.yaml');
  const book = yaml.load(fs.readFileSync(file, 'utf8'));
  const names = [['LISBON', 'Portugal'], ['SINTRA', 'Palácio da Pena'], ['PORTO', 'Douro']];
  Object.values(book.chapters).forEach((c, i) => { c.title = names[i][0]; c.subtitle = names[i][1]; c.mark = String(i + 1); });
  fs.writeFileSync(file, bookText(book));
  const b2 = yaml.load(fs.readFileSync(file, 'utf8'));
  ok(Object.values(b2.chapters).map(c => c.title).join() === 'LISBON,SINTRA,PORTO', 'chapter titles editable in book.yaml');

  // review page + server: the picker saves marks to feedback.json
  const rv = run('review', '--book', B);
  ok(rv.chapters.length === 3 && fs.existsSync(path.join(B, 'out', 'review', 'index.html')), `review page built (${rv.chapters.map(c => c.photos).join('/')} photos)`);
  const srv = spawn(process.execPath, [CLI, 'serve', '--book', B, '--port', '4790'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((res, rej) => { let s = ''; srv.stdout.on('data', d => { s += d; try { res(JSON.parse(s).url); } catch {} }); setTimeout(() => rej(new Error('server did not start')), 15000); });
  const inv = JSON.parse(fs.readFileSync(path.join(B, 'cache', 'inventory.json'), 'utf8'));
  // like ~70%, maybe ~10%, no the rest
  for (const [i, r] of inv.entries()) await fetch(url + 'api/save', { method: 'POST', body: JSON.stringify({ type: 'marks', id: r.file, value: i % 10 < 7 ? 'like' : i % 10 < 8 ? 'maybe' : 'no' }) });
  await fetch(url + 'api/save', { method: 'POST', body: JSON.stringify({ type: 'notes', id: 'photo:Camera/DSC_1003.jpg', value: 'use this one big' }) });
  const page = await (await fetch(url)).text();
  const thumb = await fetch(url + JSON.parse(page.match(/const DATA = (.*);\n/)[1]).chapters[0].photos[0].thumb);
  ok(page.includes('Pick photos') && thumb.ok, `server at ${url} serves the page and thumbnails`);
  srv.kill();
  const fb = JSON.parse(fs.readFileSync(path.join(B, 'feedback.json'), 'utf8'));
  ok(Object.keys(fb.marks).length === 78 && fb.notes['photo:Camera/DSC_1003.jpg'].text, 'marks and notes saved in feedback.json');

  const lay = run('layout', '--book', B);
  const sp = yaml.load(fs.readFileSync(file, 'utf8')).spreads;
  ok(sp.length > 0, `layout: ${lay.spreads} spreads, ${lay.pages} pages${lay.notes.length ? ' – ' + lay.notes.join('; ') : ''}`);
  const crossing = sp.some(s => s.spread || [s.left, s.right].some(p => p?.frames?.some(f => f.box[0] < 0 || f.box[0] + f.box[2] > 220)));
  ok(format === 'saal-21x28' ? crossing : !crossing, format === 'saal-21x28' ? 'layflat: photos cross the fold' : 'not layflat: nothing crosses the fold');

  const r = run('render', '--book', B);
  ok(!r.warnings.length, `render: ${r.pages} pages, warnings: ${r.warnings.join(' | ') || 'none'}`);
  ok(fs.existsSync(path.join(B, 'out', 'Book preview.pdf')) && fs.existsSync(path.join(B, 'out', 'preview', 'C00_cover.jpg')), 'previews + Book preview.pdf');
  ok(r.lowResolution.length >= 1, `resolution check flags the small file (${r.lowResolution.length})`);

  run('review', '--book', B);
  const fr = run('feedback', '--book', B);
  ok(fr.open.length === 1 && fr.marks.ch1.like > 0, 'feedback report lists the open note and the marks');
  run('done', 'photo:Camera/DSC_1003.jpg', 'made it big on S02', '--book', B);
  ok(run('feedback', '--book', B).open.length === 0, 'handled note filed away');

  const p = run('print', '--book', B);
  if (format === 'editor-images') ok(p.files.filter(f => f.endsWith('.jpg')).length === r.pages + 1, `print: ${p.files.length} page images`);
  else {
    const c = p.checks.find(x => x.file === 'content.pdf');
    const expectPages = format === 'saal-21x28' ? r.spreads : r.pages;
    ok(c.pages === expectPages && c.nonRGB === 0 && c.fonts.length > 0, `print: content.pdf ${c.pages} pages ${c.sizes.join(', ')}, fonts embedded, RGB`);
  }
}
const after = fs.readdirSync(path.join(PHOTOS, 'Camera')).map(f => fs.statSync(path.join(PHOTOS, 'Camera', f)).mtimeMs).join();
ok(before === after, 'original photos untouched');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
