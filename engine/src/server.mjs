// Small local web server for the review page. Only reachable from this computer (127.0.0.1).
// Everything people click or type is saved straight away in <book>/feedback.json.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { feedbackFile, loadFeedback, writeJSON } from './workspace.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json' };

export function serve(ws, { port = 4747, open = false } = {}) {
  const roots = { thumbs: path.join(ws.cache, 'thumbs'), preview: path.join(ws.out, 'preview') };
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  const sendFile = (res, file) => {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  };
  let queue = Promise.resolve();   // one write at a time
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(ws.out, 'review', 'index.html'));
    if (req.method === 'GET' && p === '/book-preview.pdf') return sendFile(res, path.join(ws.out, 'Book preview.pdf'));
    if (req.method === 'GET' && p === '/api/feedback') return send(res, 200, JSON.stringify(loadFeedback(ws)), TYPES['.json']);
    if (req.method === 'GET' && p === '/api/built') {
      const f = path.join(ws.out, 'review', 'index.html');
      return send(res, 200, JSON.stringify({ built: fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0 }), TYPES['.json']);
    }
    const m = p.match(/^\/(thumbs|preview)\/([^/\\]+)$/);
    if (req.method === 'GET' && m) return sendFile(res, path.join(roots[m[1]], m[2]));
    if (req.method === 'POST' && p === '/api/save') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        queue = queue.then(() => {
          try {
            const { type, id, value } = JSON.parse(body);
            if (!['marks', 'notes', 'answers'].includes(type) || typeof id !== 'string') return send(res, 400, 'bad request');
            const fb = loadFeedback(ws);
            if (type === 'notes') {
              const prev = fb.notes[id] || { history: [] };
              fb.notes[id] = { ...prev, text: String(value || ''), at: new Date().toISOString() };
              if (!fb.notes[id].text && !(fb.notes[id].history || []).length) delete fb.notes[id];
            } else if (value == null || value === '') delete fb[type][id];
            else fb[type][id] = value;
            writeJSON(feedbackFile(ws), fb);
            send(res, 200, JSON.stringify({ ok: true }), TYPES['.json']);
          } catch (e) { send(res, 500, String(e.message)); }
        });
      });
      return;
    }
    send(res, 404, 'not found');
  });
  const tryListen = (pt, left) => new Promise((resolve, reject) => {
    server.once('error', (e) => (e.code === 'EADDRINUSE' && left > 0 ? resolve(tryListen(pt + 1, left - 1)) : reject(e)));
    server.listen(pt, '127.0.0.1', () => resolve(pt));
  });
  return tryListen(port, 20).then((pt) => {
    const link = `http://localhost:${pt}/`;
    fs.writeFileSync(path.join(ws.out, 'review', 'url.txt'), link);
    if (open) exec(process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`);
    return link;
  });
}
