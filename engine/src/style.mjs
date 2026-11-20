// Default look of a book. book.yaml `style:` only needs the parts you want to change.
export const DEFAULT_STYLE = {
  margin: { top: 4, bottom: 4, outer: 4, inner: 2 },   // mm: 4 mm around the edge, 2 + 2 mm across the fold
  gap: 4,                                              // mm between photos
  endpaper: 'paper',
  colors: { accent: '#A8322B', paper: '#F5F0E4', ink: '#23201C', muted: '#7A7368', white: '#FFFFFF' },
  fonts: {                                             // ship with the engine (Jost, SIL Open Font License)
    light: 'fonts/Jost-300.ttf',
    text: 'fonts/Jost-400.ttf',
    medium: 'fonts/Jost-500.ttf',
    // cjk: fonts/NotoSerifSC-Regular.otf   <- add a font like this for Chinese/Japanese/Korean text
  },
  type: {   // size in pt, tracking in em
    chapterTitle: { font: 'light', size: 22, tracking: 0.28, color: 'ink' },
    chapterSub: { font: 'light', size: 14, tracking: 0.2, color: 'muted' },
    dateLine: { font: 'text', size: 8.5, tracking: 0.28, color: 'muted', gap: 7 },
    coverTitle: { font: 'text', size: 44, tracking: 0.3, color: 'ink' },
    coverSub: { font: 'light', size: 20, tracking: 0.25, color: 'ink', gap: 8 },
    spine: { font: 'text', size: 14, tracking: 0.35, color: 'ink' },
  },
  titleLine: { bg: 'none', height: 14, mark: 7, space: 6 },   // slim one-line chapter title on the chapter's first page
  minTitle: 12,
  previewCodes: true,   // small photo codes on previews (never printed)
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  if (!isObj(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  return out;
}
export const withDefaults = (style) => merge(DEFAULT_STYLE, style || {});
