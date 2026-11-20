// A "book folder" (workspace) holds everything about one book: book.yaml, feedback.json, questions.yaml, cache/, out/.
// The photos live elsewhere (book.yaml `photos:`) and are only read.
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { formatFor } from './formats.mjs';
import { initPhotos } from './photos.mjs';

export const ENGINE = path.resolve(import.meta.dirname, '..');

// Book folder from --book <dir>, else PHOTOBOOK_DIR, else the current folder.
export function bookDirFromArgs(args) {
  const i = args.indexOf('--book');
  const dir = i >= 0 ? args[i + 1] : process.env.PHOTOBOOK_DIR || process.cwd();
  if (i >= 0) args.splice(i, 2);
  return path.resolve(dir);
}

export function openBook(dir, { needPhotos = true } = {}) {
  const file = path.join(dir, 'book.yaml');
  if (!fs.existsSync(file)) throw new Error(`No book.yaml in ${dir}. Start a book with: photobook new "<folder>" --photos "<photo folder>" --format <id>`);
  const book = yaml.load(fs.readFileSync(file, 'utf8')) || {};
  const fmt = formatFor(book);
  const photos = path.resolve(dir, book.photos || '.');
  if (needPhotos && !fs.existsSync(photos)) throw new Error(`Photo folder not found: ${photos} (book.yaml "photos:")`);
  const cache = path.join(dir, 'cache'), out = path.join(dir, 'out');
  fs.mkdirSync(cache, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  initPhotos({ root: photos, cache, skip: [dir] });
  return { dir, file, book, fmt, photos, cache, out };
}

// Fonts: a path in book.yaml is looked up in the book folder first, then in the engine (fonts/ ships Jost).
export function fontPath(ws, file) {
  for (const base of [ws.dir, ENGINE]) { const p = path.resolve(base, file); if (fs.existsSync(p)) return p; }
  throw new Error(`Font not found: ${file}`);
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
// Write via a temp file so a crash never leaves half a file
export function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export const feedbackFile = (ws) => path.join(ws.dir, 'feedback.json');
export function loadFeedback(ws) {
  const fb = readJSON(feedbackFile(ws), {});
  return { marks: fb.marks || {}, notes: fb.notes || {}, answers: fb.answers || {} };
}

export function loadQuestions(ws) {
  const f = path.join(ws.dir, 'questions.yaml');
  if (!fs.existsSync(f)) return [];
  return (yaml.load(fs.readFileSync(f, 'utf8')) || []).filter(q => !q.done);
}

// Chapters in book order: [{ id, ...chapter }]
export const chapterList = (book) => Object.entries(book.chapters || {}).map(([id, c]) => ({ id, ...c }));

// Save book.yaml, keeping a dated backup of the previous version in cache/history/
export function saveBook(ws, text) {
  const hist = path.join(ws.cache, 'history');
  fs.mkdirSync(hist, { recursive: true });
  if (fs.existsSync(ws.file)) fs.copyFileSync(ws.file, path.join(hist, `book-${new Date().toISOString().replace(/[:.]/g, '-')}.yaml`));
  fs.writeFileSync(ws.file, text);
}
