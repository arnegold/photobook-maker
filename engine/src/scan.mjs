// Scan the photo folder (read-only): date, place, camera and size of every photo, then suggest chapters from
// gaps in time and jumps in place. Writes cache/inventory.json and cache/chapters-suggested.yaml.
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import * as yaml from 'js-yaml';
import { listPhotos, abs } from './photos.mjs';
import { readJSON, writeJSON } from './workspace.mjs';

const km = (a, b) => {   // great-circle distance
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const dayOf = (iso) => iso?.slice(0, 10);
// EXIF times have no time zone: we read them as "local clock time" and only compare them with each other
const localISO = (d) => d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19) : null;

// first 512 KB of a file: enough for the EXIF block (exifr's own file reading leaks handles on new Node versions)
function head(file) {
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(512 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0); return buf.subarray(0, n); } finally { fs.closeSync(fd); }
}

export async function inventory(ws, { log = () => {} } = {}) {
  const invFile = path.join(ws.cache, 'inventory.json');
  const old = new Map((readJSON(invFile, [])).map(r => [r.file, r]));
  const { photos, unsupported } = listPhotos({ unsupported: true });
  const rows = [];
  let i = 0;
  for (const rel of photos) {
    i++;
    const st = fs.statSync(abs(rel));
    const prev = old.get(rel);
    if (prev && prev.size === st.size && prev.mtime === st.mtimeMs) { rows.push(prev); continue; }
    if (i % 50 === 0) log(`  read ${i} / ${photos.length}`);
    let meta = {};
    try { meta = (await exifr.parse(head(abs(rel)), { tiff: true, exif: true, gps: true, xmp: false, iptc: false })) || {}; } catch {}
    let w = 0, h = 0;
    try { const m = await sharp(abs(rel)).metadata(); w = m.autoOrient?.width ?? m.width; h = m.autoOrient?.height ?? m.height; } catch { continue; }
    const taken = meta.DateTimeOriginal || meta.CreateDate || null;
    rows.push({
      file: rel, size: st.size, mtime: st.mtimeMs, w, h, ratio: +(w / h).toFixed(3),
      taken: localISO(taken), takenFrom: taken ? 'exif' : 'none',
      lat: Number.isFinite(meta.latitude) ? +meta.latitude.toFixed(5) : null, lon: Number.isFinite(meta.longitude) ? +meta.longitude.toFixed(5) : null,
      camera: [meta.Make, meta.Model].filter(Boolean).join(' ').trim() || null,
      // largest print at 200 ppi (long edge, cm)
      maxPrintCm: +(Math.max(w, h) / 200 * 2.54).toFixed(1),
    });
  }
  // photos without a date: use the file's date as a last resort (marked, because copies often change it)
  for (const r of rows) if (!r.taken) { r.taken = localISO(new Date(r.mtime)); r.takenFrom = 'file date'; }
  rows.sort((a, b) => (a.taken || '').localeCompare(b.taken || '') || a.file.localeCompare(b.file));
  // near-duplicates: same camera, shot within 2 seconds of the previous photo -> same burst group
  let burst = 0;
  rows.forEach((r, k) => {
    const p = rows[k - 1];
    r.burst = p && p.camera === r.camera && r.takenFrom === 'exif' && p.takenFrom === 'exif' && Math.abs(new Date(r.taken) - new Date(p.taken)) <= 2000 ? p.burst : ++burst;
  });
  writeJSON(invFile, rows);
  return { rows, unsupported };
}

// Chapters: a new chapter starts after a long pause or a big move. Small chapters are merged into a neighbour.
// by: 'time' (a new chapter after every long pause, e.g. per day) or 'place' (days in the same place together)
export function suggestChapters(rows, { gapHours = 'auto', moveKm = 40, minPhotos = 6, maxChapters = 14, by = 'time', placeKm = 12 } = {}) {
  if (!rows.length) return [];
  const t = (r) => new Date(r.taken + 'Z').getTime();
  // automatic pause length: a night (8 h) for trips, a week for a year book
  const span = (t(rows.at(-1)) - t(rows[0])) / 3600e3;
  const gapH = gapHours === 'auto' ? (span > 24 * 60 ? 24 * 7 : span > 24 * 3 ? 8 : 2) : gapHours;
  let groups = [[rows[0]]];
  let lastGps = rows[0].lat != null ? rows[0] : null;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], p = rows[i - 1];
    const pause = (t(r) - t(p)) / 3600e3;
    const moved = r.lat != null && lastGps ? km(lastGps, r) : 0;
    const dayChange = dayOf(r.taken) !== dayOf(p.taken);
    if (pause >= gapH || (moved >= moveKm && (dayChange || pause >= 2))) groups.push([r]); else groups.at(-1).push(r);
    if (r.lat != null) lastGps = r;
  }
  // merge groups that are too small into the closer neighbour (in time)
  const gapBetween = (a, b) => t(b[0]) - t(a.at(-1));
  const merge = (limit) => {
    let changed = true;
    while (changed && groups.length > 1) {
      changed = false;
      const i = groups.findIndex(g => g.length < limit);
      if (i < 0) break;
      const left = i > 0 ? gapBetween(groups[i - 1], groups[i]) : Infinity, right = i < groups.length - 1 ? gapBetween(groups[i], groups[i + 1]) : Infinity;
      const j = left <= right ? i - 1 : i + 1;
      const [a, b] = j < i ? [j, i] : [i, j];
      groups.splice(a, 2, [...groups[a], ...groups[b]]);
      changed = true;
    }
  };
  merge(minPhotos);
  if (by === 'place') {   // one chapter per place: join neighbours whose photos were taken close together
    const centre = (g) => { const p = g.filter(r => r.lat != null); return p.length ? { lat: p.reduce((a, r) => a + r.lat, 0) / p.length, lon: p.reduce((a, r) => a + r.lon, 0) / p.length } : null; };
    for (let i = 0; i < groups.length - 1;) {
      const a = centre(groups[i]), b = centre(groups[i + 1]);
      if (a && b && km(a, b) < placeKm) groups.splice(i, 2, [...groups[i], ...groups[i + 1]]); else i++;
    }
  }
  while (groups.length > maxChapters) { // too many: merge the pair with the shortest pause between them
    let best = 0;
    for (let i = 1; i < groups.length - 1; i++) if (gapBetween(groups[i], groups[i + 1]) < gapBetween(groups[best], groups[best + 1])) best = i;
    groups.splice(best, 2, [...groups[best], ...groups[best + 1]]);
  }
  return groups.map((g, i) => {
    const gps = g.filter(r => r.lat != null);
    const centre = gps.length ? { lat: +(gps.reduce((a, r) => a + r.lat, 0) / gps.length).toFixed(4), lon: +(gps.reduce((a, r) => a + r.lon, 0) / gps.length).toFixed(4) } : null;
    const folders = [...new Set(g.map(r => path.posix.dirname(r.file)).filter(d => d !== '.'))];
    return { id: `ch${i + 1}`, title: `Chapter ${i + 1}`, from: g[0].taken, to: g.at(-1).taken, dates: dateRange(g[0].taken, g.at(-1).taken), photos: g.length, centre, folders, files: g.map(r => r.file) };
  });
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export function dateRange(a, b) {
  if (!a) return '';
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number), [y2, m2, d2] = (b || a).slice(0, 10).split('-').map(Number);
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${d1} ${MONTHS[m1 - 1]} ${y1}` : `${d1} – ${d2} ${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y1}`;
  return `${MONTHS[m1 - 1]} ${y1} – ${MONTHS[m2 - 1]} ${y2}`;
}

export async function scan(ws, opts = {}) {
  const log = opts.log || console.log;
  const { rows, unsupported } = await inventory(ws, { log });
  const chapters = suggestChapters(rows, opts);
  const out = path.join(ws.cache, 'chapters-suggested.yaml');
  fs.writeFileSync(out, '# Suggested chapters (from photo dates and places). Not used until they are copied into book.yaml (photobook chapters --apply).\n' +
    yaml.dump(chapters.map(({ files, ...c }) => ({ ...c, files: files.length > 6 ? [...files.slice(0, 3), `... ${files.length - 6} more ...`, ...files.slice(-3)] : files })), { lineWidth: 140 }));
  const withGps = rows.filter(r => r.lat != null).length, noDate = rows.filter(r => r.takenFrom !== 'exif').length;
  const cams = [...new Set(rows.map(r => r.camera || 'unknown'))];
  const small = rows.filter(r => r.maxPrintCm < 15).length;
  const bursts = rows.length - new Set(rows.map(r => r.burst)).size;
  return { rows, unsupported, chapters, summary: { photos: rows.length, withGps, noDate, cameras: cams, small, bursts, from: rows[0]?.taken, to: rows.at(-1)?.taken } };
}
