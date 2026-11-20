// Photo lookup, crop maths, colour matching and cached crops. Original photos are only ever READ, never changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export const PHOTO_EXT = /\.(jpe?g|png|tiff?|webp)$/i;
export const UNSUPPORTED_EXT = /\.(heic|heif|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;

let ROOT = null, CACHE = null, GRADED = null, SKIP = [];
const metaCache = new Map();
let index = null;

// root = the photo folder (read-only); cache = <book>/cache; skip = folders never scanned (e.g. the book folder itself)
export function initPhotos({ root, cache, skip = [] }) {
  ROOT = path.resolve(root);
  CACHE = path.join(cache, 'crops');
  GRADED = path.join(cache, 'graded');
  SKIP = skip.map(s => path.resolve(s).toLowerCase());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(GRADED, { recursive: true });
  index = null;
}
export const photoRoot = () => ROOT;
export const abs = (rel) => path.join(ROOT, rel);

// Every photo under the root, as paths relative to it (forward slashes). Folders starting with _ or . are skipped.
export function listPhotos({ unsupported = false } = {}) {
  const out = [], bad = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.includes(p.toLowerCase())) walk(p); }
      else if (PHOTO_EXT.test(e.name)) out.push(path.relative(ROOT, p).replaceAll('\\', '/'));
      else if (UNSUPPORTED_EXT.test(e.name)) bad.push(path.relative(ROOT, p).replaceAll('\\', '/'));
    }
  };
  walk(ROOT);
  out.sort();
  return unsupported ? { photos: out, unsupported: bad } : out;
}

const stemOf = (p) => path.basename(p).replace(/\.[^.]+$/, '').toLowerCase();
function buildIndex() {
  index = new Map();
  for (const rel of listPhotos()) {
    const k = stemOf(rel);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(rel);
  }
}
const isEdited = (rel) => rel.split('/').some(seg => /^(export|exports|edited|edits)$/i.test(seg));

// "IMG_1234" or "Day 1/IMG_1234.jpg" -> path relative to the photo folder.
// A re-edited copy inside a folder called Export / Edited always wins over the original.
export function resolveSrc(src, preferFolders = []) {
  src = String(src);
  if (!index) buildIndex();
  const k = stemOf(src);
  const hits = index.get(k);
  if (!hits) {
    if (fs.existsSync(path.join(ROOT, src))) return src;
    throw new Error(`Photo not found: ${src}`);
  }
  const edited = hits.find(isEdited);
  if (edited) return edited;
  if (src.includes('/') && hits.includes(src)) return src;
  for (const f of preferFolders) { const h = hits.find(x => x.startsWith(f + '/')); if (h) return h; }
  return hits[0];
}
// Shortest unambiguous name for a photo (used when writing book.yaml): the file stem when it is unique
export function shortName(rel) {
  if (!index) buildIndex();
  const hits = index.get(stemOf(rel)) || [];
  return hits.length <= 1 || hits.filter(h => !isEdited(h)).length <= 1 ? path.basename(rel).replace(/\.[^.]+$/, '') : rel;
}

export async function photoMeta(rel) {
  if (metaCache.has(rel)) return metaCache.get(rel);
  const m = await sharp(fs.readFileSync(path.join(ROOT, rel))).metadata();
  const w = m.autoOrient?.width ?? m.width, h = m.autoOrient?.height ?? m.height;
  const r = { w, h, ratio: w / h };
  metaCache.set(rel, r);
  return r;
}

// Region of the source (px) that fills a box of ratio boxR. focus = [fx, fy] in 0..1, zoom >= 1
export function cropRegion(meta, boxR, focus = [0.5, 0.5], zoom = 1) {
  let rw = Math.min(meta.w, meta.h * boxR), rh = rw / boxR;
  rw /= zoom; rh /= zoom;
  const cx = Math.min(Math.max(focus[0] * meta.w, rw / 2), meta.w - rw / 2);
  const cy = Math.min(Math.max(focus[1] * meta.h, rh / 2), meta.h - rh / 2);
  return { left: Math.round(cx - rw / 2), top: Math.round(cy - rh / 2), width: Math.round(rw), height: Math.round(rh) };
}

// ---------- colour matching (e.g. phone pics -> camera look) ----------
// Reinhard colour transfer in CIELAB: the photo's mean and spread per channel move towards a reference photo.
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const Xn = 0.95047, Zn = 1.08883;
const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
const fi = (t) => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
const gam = (c) => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return c < 0 ? 0 : c > 1 ? 255 : Math.round(c * 255); };
function toLab(r, g, b, out) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / Xn, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / Zn;
  const fx = f(X), fy = f(Y), fz = f(Z);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
}
function labStats(raw) {
  const n = raw.length / 3, s = [0, 0, 0], q = [0, 0, 0], o = [0, 0, 0];
  for (let i = 0; i < raw.length; i += 3) { toLab(raw[i], raw[i + 1], raw[i + 2], o); for (let k = 0; k < 3; k++) { s[k] += o[k]; q[k] += o[k] * o[k]; } }
  const mean = s.map(v => v / n);
  return { mean, std: q.map((v, k) => Math.sqrt(Math.max(1e-6, v / n - mean[k] ** 2))) };
}
const smallRaw = (file) => sharp(fs.readFileSync(file)).rotate().resize(400, 400, { fit: 'inside' }).removeAlpha().toColourspace('srgb').raw().toBuffer();

// grade: "IMG_0001" (reference photo) or { ref, strength, warmth, tint, fade, hl, hlWarm, exposure, contrast }
// ref may be left out to only adjust (warmth, exposure, ...)
async function gradedFile(rel, grade, folders) {
  const src = path.join(ROOT, rel);
  if (!grade) return src;
  const g = typeof grade === 'string' ? { ref: grade } : grade;
  const strength = g.ref ? (g.strength ?? 0.8) : 0;
  const refRel = g.ref ? resolveSrc(g.ref, folders) : null;
  const st = fs.statSync(src);
  const key = crypto.createHash('sha1').update(JSON.stringify([rel, st.size, st.mtimeMs, refRel, strength, g.warmth || 0, g.tint || 0, g.fade || 0, g.hl || 0, g.hlWarm || 0, g.exposure || 0, g.contrast || 0])).digest('hex').slice(0, 16);
  const out = path.join(GRADED, key + '.jpg');
  if (fs.existsSync(out)) return out;
  const a = labStats(await smallRaw(src)), b = refRel ? labStats(await smallRaw(path.join(ROOT, refRel))) : a;
  const { data, info } = await sharp(fs.readFileSync(src)).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const o = [0, 0, 0];
  const k = [0, 1, 2].map(i => 1 + strength * (b.std[i] / a.std[i] - 1));
  const d = [0, 1, 2].map(i => strength * (b.mean[i] - a.mean[i]));
  d[0] += g.exposure || 0;  // brightness in L* units: - = darker
  d[1] += g.tint || 0;      // + = more red/magenta (skin)
  d[2] += g.warmth || 0;    // + = warmer (yellow)
  const fade = g.fade || 0, hl = g.hl || 0, hlWarm = g.hlWarm || 0;
  for (let i = 0; i < data.length; i += 3) {
    toLab(data[i], data[i + 1], data[i + 2], o);
    let L = (o[0] - a.mean[0]) * k[0] + a.mean[0] + d[0];
    if (g.contrast) L = 50 + (L - 50) * (1 + g.contrast);
    if (fade) L = fade + L * (100 - 1.5 * fade) / 100;
    const hw = L > 55 ? Math.min(1, (L - 55) / 35) : 0;
    if (hl && L > 60) L = 60 + (L - 60) * (1 - hl);
    const A = (o[1] - a.mean[1]) * k[1] + a.mean[1] + d[1];
    const B = (o[2] - a.mean[2]) * k[2] + a.mean[2] + d[2] + hlWarm * hw;
    const fy = (L + 16) / 116, X = fi(fy + A / 500) * Xn, Y = fi(fy), Z = fi(fy - B / 200) * Zn;
    data[i] = gam(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
    data[i + 1] = gam(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
    data[i + 2] = gam(0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(out);
  return out;
}

// Returns { buf, ppi } – a JPEG crop sized for the box at <= targetPpi (never upscaled)
export async function cropFor(rel, boxMM, { focus, zoom, targetPpi, quality, grade, folders }) {
  const meta = await photoMeta(rel);
  const region = cropRegion(meta, boxMM.w / boxMM.h, focus, zoom);
  const ppi = region.width / (boxMM.w / 25.4);
  const scale = Math.min(1, targetPpi / ppi);
  const outW = Math.max(1, Math.round(region.width * scale)), outH = Math.max(1, Math.round(region.height * scale));
  const srcFile = await gradedFile(rel, grade, folders);
  const st = fs.statSync(srcFile);
  const key = crypto.createHash('sha1').update(JSON.stringify([srcFile, st.size, st.mtimeMs, region, outW, outH, quality])).digest('hex').slice(0, 16);
  const cp = path.join(CACHE, key + '.jpg');
  if (!fs.existsSync(cp)) {
    await sharp(fs.readFileSync(srcFile)).rotate().extract(region).resize(outW, outH, { kernel: 'lanczos3' })
      .toColourspace('srgb').jpeg({ quality, chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0' }).toFile(cp);
  }
  return { buf: fs.readFileSync(cp), ppi, region, outW, outH };
}
