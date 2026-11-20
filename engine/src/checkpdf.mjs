// Preflight of the print PDFs: page count, page size, embedded fonts, images, colour spaces.
import fs from 'node:fs';
import path from 'node:path';
import * as mupdf from 'mupdf';

export function checkPdf(file) {
  const b = fs.readFileSync(file);
  const d = mupdf.Document.openDocument(b, 'application/pdf');
  const n = d.countPages();
  const sizes = new Set();
  for (let i = 0; i < n; i++) { const [x0, y0, x1, y1] = d.loadPage(i).getBounds(); sizes.add(`${((x1 - x0) * 25.4 / 72).toFixed(1)} x ${((y1 - y0) * 25.4 / 72).toFixed(1)} mm`); }
  const raw = b.toString('latin1');
  const fonts = [...new Set(raw.match(/\/BaseFont \/[A-Z]{6}\+[\w-]+/g) || [])].map(s => s.replace('/BaseFont /', ''));
  const images = (raw.match(/\/Subtype \/Image/g) || []).length;
  const nonRGB = (raw.match(/\/ColorSpace \/Device(CMYK|N)|\/Separation/g) || []).length;
  return { file: path.basename(file), mb: +(b.length / 1e6).toFixed(1), pages: n, sizes: [...sizes], fonts, images, nonRGB };
}
