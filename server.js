// 1인 굿즈 판매자를 위한 굿즈 결제시스템 - 로컬 서버 (의존성 없음, Node 18+)
// 배포 버전은 netlify/functions/api.mjs 가 같은 core.js 를 씁니다.
const http = require('http'), fs = require('fs'), path = require('path');
const core = require('./core');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const SHOPS = path.join(DATA, 'shops'), UP = path.join(DATA, 'uploads');
fs.mkdirSync(SHOPS, { recursive: true }); fs.mkdirSync(UP, { recursive: true });
const store = {
  load: async (id) => { try { return JSON.parse(fs.readFileSync(path.join(SHOPS, id + '.json'), 'utf8')); } catch { return null; } },
  save: async (id, db) => fs.writeFileSync(path.join(SHOPS, id + '.json'), JSON.stringify(db)),
  putImage: async (name, b64) => fs.writeFileSync(path.join(UP, name), Buffer.from(b64, 'base64')),
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({ text: b }); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type) => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8' }); res.end(body); };
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = await core.handle(store, { method: req.method, url, headers: req.headers, body: req.method === 'GET' ? {} : await readBody(req) });
      return send(r.code, JSON.stringify(r.body), 'application/json');
    }
    const f = url.pathname === '/' ? '/seller.html' : url.pathname;
    const base = f.startsWith('/uploads/') ? DATA : path.join(__dirname, 'public');
    const fp = path.normalize(path.join(base, f));
    if (!fp.startsWith(base) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return send(404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' }); res.end(fs.readFileSync(fp));
  } catch (e) { console.error(e); send(500, JSON.stringify({ error: '서버 오류' }), 'application/json'); }
}).listen(PORT, () => console.log('굿즈 결제 서버: http://localhost:' + PORT));
