// Makes a small fake holiday (about 75 photos) with real-looking EXIF dates, GPS and cameras, for testing.
//   node engine/test/make-sample.mjs [folder]     (default: engine/test/sample-photos)
// Five days: Lisbon (2 days), Sintra (1), Porto (2). Camera photos in Camera/, phone photos (no GPS) in Phone/.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve(process.argv[2] || path.join(import.meta.dirname, 'sample-photos'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'Camera'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'Phone'), { recursive: true });

const days = [
  { place: 'Lisbon', lat: 38.7139, lon: -9.1394, date: '2026:06:03', n: 15, hue: 205 },
  { place: 'Lisbon', lat: 38.7101, lon: -9.1302, date: '2026:06:04', n: 14, hue: 25 },
  { place: 'Sintra', lat: 38.7975, lon: -9.3906, date: '2026:06:05', n: 13, hue: 120 },
  { place: 'Porto', lat: 41.1413, lon: -8.6110, date: '2026:06:06', n: 14, hue: 280 },
  { place: 'Porto', lat: 41.1496, lon: -8.6109, date: '2026:06:07', n: 12, hue: 340 },
];
const shapes = [[3, 2], [3, 2], [3, 2], [2, 3], [3, 2], [16, 9], [2, 3], [3, 2], [1, 1], [4, 3]];
const dms = (v) => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 100); return `${d}/1 ${m}/1 ${s}/100`; };
let seq = 1000;

function svg(w, h, hue, label, k) {
  const sky = `hsl(${hue},55%,${62 + (k % 3) * 6}%)`, ground = `hsl(${(hue + 40) % 360},35%,${32 + (k % 4) * 5}%)`;
  const sunX = (0.2 + ((k * 37) % 60) / 100) * w, horizon = h * (0.55 + ((k * 13) % 20) / 100);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="hsl(${hue},40%,88%)"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${sunX}" cy="${h * 0.25}" r="${Math.min(w, h) * 0.09}" fill="#fff6d0"/>
    <path d="M0 ${horizon} Q ${w * 0.3} ${horizon - h * 0.18} ${w * 0.55} ${horizon} T ${w} ${horizon - h * 0.05} V ${h} H 0 Z" fill="${ground}"/>
    <rect x="${w * 0.62}" y="${horizon - h * 0.22}" width="${w * 0.06}" height="${h * 0.22}" fill="hsl(${hue},20%,25%)"/>
    <circle cx="${w * 0.35}" cy="${horizon + h * 0.08}" r="${Math.min(w, h) * 0.05}" fill="#f2c9a0"/>
    <text x="50%" y="${h * 0.9}" font-family="Arial" font-weight="bold" font-size="${Math.min(w, h) * 0.08}" text-anchor="middle" fill="#ffffff" opacity="0.9">${label}</text></svg>`);
}

let made = 0;
for (const [di, d] of days.entries()) {
  for (let i = 0; i < d.n; i++) {
    const [a, b] = shapes[(i + di) % shapes.length];
    const long = i === 5 && di === 1 ? 900 : 3000;                  // one deliberately small file
    const w = a >= b ? long : Math.round(long * a / b), h = a >= b ? Math.round(long * b / a) : long;
    const hh = 9 + Math.floor(i * 10 / d.n), mm = (i * 7) % 60, ss = i === 3 ? 10 : 0;
    // photo 4 is a burst copy of photo 3, one second later
    const time = i === 4 ? `${String(9 + Math.floor(3 * 10 / d.n)).padStart(2, '0')}:${String(21 % 60).padStart(2, '0')}:11` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const name = `DSC_${++seq}.jpg`;
    const label = `${d.place} ${di + 1}.${i + 1}`;
    await sharp(svg(w, h, d.hue, label, i)).jpeg({ quality: 85 })
      .withExif({ IFD0: { Make: 'Sampleco', Model: 'Mirrorless 1' }, IFD2: { DateTimeOriginal: `${d.date} ${i === 4 ? `${String(9 + Math.floor(3 * 10 / d.n)).padStart(2, '0')}:21:11` : time}` },
        IFD3: { GPSLatitudeRef: d.lat >= 0 ? 'N' : 'S', GPSLatitude: dms(d.lat + i * 0.0007), GPSLongitudeRef: d.lon >= 0 ? 'E' : 'W', GPSLongitude: dms(d.lon + i * 0.0005) } })
      .toFile(path.join(OUT, 'Camera', name));
    made++;
  }
  // two phone photos per day, portrait, no GPS
  for (let j = 0; j < 2; j++) {
    const name = `IMG_${d.date.replace(/:/g, '')}_${String(1830 + j * 7)}.jpg`;
    await sharp(svg(1500, 2000, (d.hue + 180) % 360, `${d.place} phone ${j + 1}`, j + 5)).jpeg({ quality: 82 })
      .withExif({ IFD0: { Make: 'Phonemaker', Model: 'P10' }, IFD2: { DateTimeOriginal: `${d.date} 18:${30 + j * 7}:00` } })
      .toFile(path.join(OUT, 'Phone', name));
    made++;
  }
}
fs.writeFileSync(path.join(OUT, 'Phone', 'IMG_0001.HEIC'), 'not a real HEIC – tests the "export as JPEG" warning');
console.log(`${made} sample photos in ${OUT}`);
