// Book formats per printing service. All sizes in mm.
//
// verified: true  = values taken from the printer's own template (safe to upload).
// verified: false = best public information. Before the final export, download the printer's template
//                   for your exact page count and put the real numbers under `formatOverrides:` in book.yaml.
//
// Fields
//   pageW, pageH     inner page trim size (one page, not the spread)
//   bleed            extra image beyond the trim on every outer edge
//   safe             keep text and faces at least this far inside the trim
//   layflat          true = pages open flat, so a photo may cross the fold (middle of the spread)
//   contentExport    'spreads' = one PDF page per double page, 'pages' = one PDF page per page
//   upload           'pdf' = the service accepts our PDFs; 'images' = use its own editor and place our page images full-bleed
//   pages            { min, max, step } page count rules (step: pages must be added in groups of this size)
//   endpapers        true = the inside of the covers is NOT printed, so the first left and last right page stay empty
//   cover            { height, wrapX, wrapY, spine(n) -> mm, hinge(n) -> mm }; height = board height incl. nothing else
//   minFont          printer's minimum type sizes in pt

// Saal 21x28 ("8.5 x 11") hardcover: per page count -> [cover width incl. wrap, spine, hinge] in 1/10 mm.
// Source: saal-digital.com professional zone template links, checked 2026-11-07 for a printed book.
const SAAL_21x28_COVER = {
  26: [4585, 120, 90], 28: [4585, 120, 90], 30: [4585, 130, 90], 32: [4585, 130, 90], 34: [4598, 130, 90],
  36: [4598, 140, 90], 38: [4598, 140, 90], 40: [4598, 140, 90], 42: [4615, 150, 90], 44: [4615, 150, 90],
  46: [4615, 150, 90], 48: [4615, 160, 90], 50: [4615, 160, 90], 52: [4625, 160, 90], 54: [4625, 180, 90],
  56: [4625, 180, 110], 58: [4635, 180, 110], 60: [4635, 190, 110], 62: [4635, 190, 110], 64: [4644, 190, 110],
  66: [4644, 200, 110], 68: [4644, 200, 110], 70: [4654, 200, 110], 72: [4654, 210, 110], 74: [4654, 210, 110],
  76: [4664, 210, 110], 78: [4664, 220, 110], 80: [4664, 220, 110], 82: [4674, 220, 110], 84: [4674, 240, 110],
  86: [4674, 240, 130], 88: [4681, 240, 130], 90: [4681, 250, 130], 92: [4691, 250, 130], 94: [4691, 250, 130],
  96: [4691, 260, 130], 98: [4698, 260, 130], 100: [4698, 260, 130], 102: [4698, 270, 130], 104: [4705, 270, 130],
  106: [4705, 270, 130], 108: [4705, 280, 130], 110: [4712, 280, 130], 112: [4712, 280, 130], 114: [4712, 290, 130],
  116: [4719, 290, 150], 118: [4719, 290, 150], 120: [4719, 300, 150], 122: [4726, 300, 150], 124: [4726, 300, 150],
  126: [4726, 310, 150], 128: [4733, 310, 150], 130: [4733, 310, 150], 132: [4733, 320, 150], 134: [4740, 320, 150],
  136: [4740, 320, 150], 138: [4740, 330, 150], 140: [4767, 330, 150], 142: [4771, 330, 150], 144: [4775, 340, 150],
  146: [4786, 340, 170], 148: [4790, 340, 170], 150: [4794, 350, 170], 152: [4805, 350, 170], 154: [4809, 350, 170],
  156: [4813, 360, 170], 158: [4824, 360, 170], 160: [4828, 360, 170],
};
const saalTable = (t) => (n) => { const ks = Object.keys(t).map(Number); const k = ks.find(p => p >= n) ?? ks.at(-1); return t[k]; };
const saal2128 = saalTable(SAAL_21x28_COVER);

// Rough spine estimate for photo paper layflat books (from the Saal table above: ~12 mm at 26 pages, +0.18 mm per page).
// Only used for provisional formats; the real value comes from the printer's template.
const thickSpine = (n) => Math.round((12 + 0.18 * (n - 26)) * 10) / 10;
// Thin paper (press-printed, not layflat): ~0.06 mm per page, at least 6 mm.
const thinSpine = (n) => Math.max(6, Math.round((4 + 0.06 * n) * 10) / 10);

const IN = 25.4;

export const formats = {
  // ---------------------------------------------------------------- Saal Digital (Germany, ships EU/UK/US)
  'saal-21x28': {
    service: 'Saal Digital', product: 'Photo Book 21x28 portrait (US: 8.5x11), photo paper, layflat',
    url: 'https://www.saal-digital.com/photo-book/professional-zone',
    pageW: 210, pageH: 270, bleed: 3, safe: 10, layflat: true,
    contentExport: 'spreads', upload: 'pdf', pages: { min: 26, max: 160, step: 2 }, endpapers: false,
    cover: {
      height: 274, wrapX: 9.3, wrapY: 7.0,
      spine: (n) => saal2128(n)[1] / 10, hinge: (n) => saal2128(n)[2] / 10,
      trimW: (n) => saal2128(n)[0] / 10 - 2 * 9.3,
    },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'Printed and checked with a real 72-page book (Nov 2026). Saal prints the inside of the covers. Paper: matte or glossy photo paper.',
    verified: true,
  },
  'saal-28x21': {
    service: 'Saal Digital', product: 'Photo Book 28x21 landscape, photo paper, layflat',
    url: 'https://www.saal-digital.com/photo-book/professional-zone',
    pageW: 270, pageH: 210, bleed: 3, safe: 10, layflat: true,
    contentExport: 'spreads', upload: 'pdf', pages: { min: 26, max: 160, step: 2 }, endpapers: false,
    cover: { height: 214, wrapX: 9.3, wrapY: 7.0, spine: thickSpine, hinge: (n) => (n < 56 ? 9 : n < 86 ? 11 : 13) },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'Assumed to be the 21x28 rotated. Check the template on the professional-zone page before export.',
    verified: false,
  },
  'saal-30x30': {
    service: 'Saal Digital', product: 'Photo Book 30x30 square, photo paper, layflat',
    url: 'https://www.saal-digital.com/photo-book/professional-zone',
    pageW: 300, pageH: 300, bleed: 3, safe: 10, layflat: true,
    contentExport: 'spreads', upload: 'pdf', pages: { min: 26, max: 160, step: 2 }, endpapers: false,
    cover: { height: 304, wrapX: 9.3, wrapY: 7.0, spine: thickSpine, hinge: (n) => (n < 56 ? 9 : n < 86 ? 11 : 13) },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'Check the template on the professional-zone page before export.',
    verified: false,
  },
  'saal-pro-30x21': {
    service: 'Saal Digital', product: 'Professional Line 30x21 landscape, layflat, handmade cover',
    url: 'https://www.saal-digital.com/photo-book/professional-zone',
    pageW: 300, pageH: 210, bleed: 3, safe: 10, layflat: true,
    contentExport: 'spreads', upload: 'pdf', pages: { min: 26, max: 130, step: 2 }, endpapers: false,
    cover: { height: 214, wrapX: 15, wrapY: 15, spine: thickSpine, hinge: () => 10 },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'Premium line (leather/linen covers often have no printed photo). Check the template before export.',
    verified: false,
  },

  // ---------------------------------------------------------------- CEWE (Europe; "PDF to Book" via InDesign templates)
  'cewe-large-portrait': {
    service: 'CEWE', product: 'CEWE PHOTOBOOK Large Portrait ~21x28, hardcover, layflat photographic paper option',
    url: 'https://www.cewe.co.uk/pdf-to-book-user-guide.html',
    pageW: 210, pageH: 280, bleed: 3, safe: 10, layflat: true,
    contentExport: 'pages', upload: 'pdf', pdfVersion: '1.3', pages: { min: 26, max: 202, step: 4 }, endpapers: true,
    cover: { height: 280, wrapX: 10, wrapY: 10, spine: thickSpine, hinge: () => 10 },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'CEWE: content 3 mm bleed, cover 10 mm bleed, PDF 1.3, pages in groups of 4; first page is a single right page. Exact sizes come from the CEWE Template Generator.',
    verified: false,
  },
  'cewe-xl-square': {
    service: 'CEWE', product: 'CEWE PHOTOBOOK XL Square ~30x30, hardcover, layflat photographic paper option',
    url: 'https://www.cewe.co.uk/pdf-to-book-user-guide.html',
    pageW: 300, pageH: 300, bleed: 3, safe: 10, layflat: true,
    contentExport: 'pages', upload: 'pdf', pdfVersion: '1.3', pages: { min: 26, max: 202, step: 4 }, endpapers: true,
    cover: { height: 300, wrapX: 10, wrapY: 10, spine: thickSpine, hinge: () => 10 },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'See cewe-large-portrait. Exact sizes come from the CEWE Template Generator.',
    verified: false,
  },
  'cewe-xxl-landscape': {
    service: 'CEWE', product: 'CEWE PHOTOBOOK XXL Landscape ~38x29, hardcover, layflat photographic paper option',
    url: 'https://www.cewe.co.uk/pdf-to-book-user-guide.html',
    pageW: 380, pageH: 290, bleed: 3, safe: 10, layflat: true,
    contentExport: 'pages', upload: 'pdf', pdfVersion: '1.3', pages: { min: 26, max: 178, step: 4 }, endpapers: true,
    cover: { height: 290, wrapX: 10, wrapY: 10, spine: thickSpine, hinge: () => 10 },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'See cewe-large-portrait. Exact sizes come from the CEWE Template Generator.',
    verified: false,
  },

  // ---------------------------------------------------------------- Blurb (US/UK; "PDF to Book")
  'blurb-standard-portrait': {
    service: 'Blurb', product: 'Blurb Photo Book Standard Portrait 8x10 in, ImageWrap hardcover (layflat paper optional)',
    url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator',
    pageW: 8 * IN, pageH: 10 * IN, bleed: 0.125 * IN, safe: 0.25 * IN, layflat: false,
    contentExport: 'pages', upload: 'pdf', pages: { min: 20, max: 240, step: 2 }, endpapers: true,
    cover: { height: 10.25 * IN, wrapX: 0.75 * IN, wrapY: 0.75 * IN, spine: thinSpine, hinge: () => 0.4 * IN },
    minFont: { sans: 8, serif: 9, light: 10 },
    notes: 'Blurb: bleed 0.125 in, safe 0.25 in, ImageWrap cover safe 1 in. Layflat paper max 110 pages (switch layflat on in book.yaml if you order it). Get exact PDF sizes from the Blurb calculator.',
    verified: false,
  },
  'blurb-large-landscape': {
    service: 'Blurb', product: 'Blurb Photo Book Large Landscape 13x11 in, ImageWrap hardcover (layflat paper optional)',
    url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator',
    pageW: 12.5 * IN, pageH: 10.63 * IN, bleed: 0.125 * IN, safe: 0.25 * IN, layflat: false,
    contentExport: 'pages', upload: 'pdf', pages: { min: 20, max: 240, step: 2 }, endpapers: true,
    cover: { height: 10.88 * IN, wrapX: 0.75 * IN, wrapY: 0.75 * IN, spine: thinSpine, hinge: () => 0.4 * IN },
    minFont: { sans: 8, serif: 9, light: 10 },
    notes: 'See blurb-standard-portrait.',
    verified: false,
  },
  'blurb-large-square': {
    service: 'Blurb', product: 'Blurb Photo Book Large Square 12x12 in, ImageWrap hardcover (layflat paper optional)',
    url: 'https://www.blurb.com/make/pdf_to_book/booksize_calculator',
    pageW: 11.75 * IN, pageH: 11.75 * IN, bleed: 0.125 * IN, safe: 0.25 * IN, layflat: false,
    contentExport: 'pages', upload: 'pdf', pages: { min: 20, max: 240, step: 2 }, endpapers: true,
    cover: { height: 12 * IN, wrapX: 0.75 * IN, wrapY: 0.75 * IN, spine: thinSpine, hinge: () => 0.4 * IN },
    minFont: { sans: 8, serif: 9, light: 10 },
    notes: 'See blurb-standard-portrait.',
    verified: false,
  },

  // ---------------------------------------------------------------- Any service with its own online editor
  'editor-images': {
    service: 'Any service with an online editor (Mixbook, Shutterfly, Albelli/Bonusprint, CEWE app, Artifact Uprising, …)',
    product: 'Page images: you place one finished image per page (or per spread) in their editor',
    url: '',
    pageW: 210, pageH: 280, bleed: 3, safe: 10, layflat: false,
    contentExport: 'pages', upload: 'images', pages: { min: 20, max: 200, step: 2 }, endpapers: true,
    cover: { height: 280, wrapX: 15, wrapY: 15, spine: thinSpine, hinge: () => 10 },
    minFont: { sans: 8, serif: 10, light: 12 },
    notes: 'Set pageW/pageH/bleed/layflat in formatOverrides to the size you pick in their editor. Export gives one 300 ppi JPG per page (or per spread for layflat).',
    verified: false,
  },
};

// Resolve the format of a book: base format + book.yaml formatOverrides (sizes, layflat, cover numbers).
export function formatFor(book) {
  const base = formats[book.format];
  if (!base) throw new Error(`Unknown format "${book.format}". Known: ${Object.keys(formats).join(', ')}`);
  const o = book.formatOverrides || {};
  const fmt = { id: book.format, ...base, ...o, cover: { ...base.cover } };
  const c = o.cover || {};
  for (const k of ['height', 'wrapX', 'wrapY']) if (c[k] != null) fmt.cover[k] = c[k];
  if (c.spine != null) fmt.cover.spine = () => c.spine;          // exact spine from the printer's template
  if (c.hinge != null) fmt.cover.hinge = () => c.hinge;
  if (c.trimW != null) fmt.cover.trimW = () => c.trimW;
  if (o.verified) fmt.verified = true;
  return fmt;
}

// Cover geometry for a page count. trimW = back board + spine + front board (without wrap).
export function coverFor(fmt, pages) {
  const n = Math.max(pages, fmt.pages.min);
  const c = fmt.cover;
  const spine = c.spine(n), hinge = c.hinge(n);
  const trimW = c.trimW ? c.trimW(n) : 2 * (fmt.pageW + 3) + spine;   // boards are a little wider than the pages
  return { pagesUsed: n, spine, hinge, board: (trimW - spine) / 2, trimW };
}

// Pages the printer counts for a book of `spreads` spreads. When the inside covers are not printed (endpapers) and pages
// are uploaded one by one, the first left and last right page are not part of the upload.
export const printedPages = (fmt, spreads) => (fmt.endpapers && fmt.contentExport === 'pages' ? 2 * spreads - 2 : 2 * spreads);
export function pageCountOk(fmt, n) {
  const { min, max, step = 2 } = fmt.pages;
  return n >= min && n <= max && (n - min) % step === 0;
}

export function describeFormat(id, f) {
  const mm = (v) => Math.round(v * 10) / 10;
  return `${id.padEnd(24)} ${f.service} – ${f.product}\n${''.padEnd(24)} page ${mm(f.pageW)} x ${mm(f.pageH)} mm, ${f.layflat ? 'layflat' : 'not layflat'}, ${f.pages.min}–${f.pages.max} pages, upload: ${f.upload}${f.verified ? ', VERIFIED' : ', provisional'}`;
}
