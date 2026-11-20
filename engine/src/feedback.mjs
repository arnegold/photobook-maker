// Read what people wrote on the review page, and file away notes that have been handled.
import { feedbackFile, loadFeedback, writeJSON, loadQuestions } from './workspace.mjs';
import { photosByChapter } from './bookfile.mjs';

export function feedbackReport(ws, rows) {
  const fb = loadFeedback(ws);
  const book = ws.book;
  const tagOf = new Map((book.spreads || []).map((s, i) => [s.id, 'S' + String(i + 1).padStart(2, '0')]));
  const open = Object.entries(fb.notes).filter(([, n]) => n.text && n.text.trim()).map(([id, n]) => {
    const [kind, ...rest] = id.split(':'); const ref = rest.join(':');
    return { id, kind, ref, where: kind === 'spread' ? (tagOf.get(ref) || ref) : kind === 'photo' ? ref : 'whole book', text: n.text.trim(), at: n.at };
  });
  const marks = {};
  if (rows) {
    const byCh = photosByChapter(book, rows);
    for (const [id, list] of Object.entries(byCh)) {
      if (!list.length) continue;
      const m = (k) => list.filter(r => fb.marks[r.file] === k).length;
      marks[id] = { photos: list.length, like: m('like'), maybe: m('maybe'), no: m('no') };
    }
  }
  const questions = loadQuestions(ws).map(q => ({ id: q.id, text: q.text, answer: fb.answers[q.id] || null }));
  return { open, marks, questions };
}

// Move handled notes into their history: done = [{ id, what }]
export function markDone(ws, done) {
  const fb = loadFeedback(ws);
  const at = new Date().toISOString();
  const moved = [];
  for (const { id, what } of done) {
    const n = fb.notes[id];
    if (!n?.text) continue;
    n.history = [...(n.history || []), { text: n.text, at, done: what || 'done' }];
    n.text = '';
    moved.push(id);
  }
  writeJSON(feedbackFile(ws), fb);
  return moved;
}
