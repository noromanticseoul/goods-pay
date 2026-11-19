// 1인 굿즈 판매자를 위한 굿즈 결제시스템 - MVP 서버 (의존성 없음, Node 18+)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA, 'db.json'), UP = path.join(DATA, 'uploads');
fs.mkdirSync(UP, { recursive: true });
const ORDER_TTL = 15 * 60 * 1000;
let db = { seller: null, products: [], codes: [], orders: [], deposits: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch {}
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
const id = (n = 6) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type + (type.startsWith('text') || type.includes('json') ? '; charset=utf-8' : '') });
  res.end(type.includes('json') ? JSON.stringify(body) : body);
}
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({ text: b }); } }); });
const isAdmin = (req) => db.seller && req.headers['x-admin-key'] === db.seller.adminKey;

function expire() { const t = now(); db.orders.forEach((o) => { if (o.status === 'pending' && t - o.createdAt > ORDER_TTL) o.status = 'expired'; }); }

// 할인 코드 + 수량으로 금액 계산
function price(product, qty, code) {
  const subtotal = product.price * qty;
  let c = null, discount = 0;
  if (code) {
    c = db.codes.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase());
    const ok = c && c.active && !product.noDiscount && (!c.maxUses || c.used < c.maxUses);
    if (!ok) return { error: '사용할 수 없는 코드예요' };
    discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  }
  return { subtotal, discount, label: c ? c.label : '', code: c ? c.code : '', base: subtotal - discount };
}

// 대기 중인 주문과 겹치지 않는 확인용 끝자리(1~99원)
function offset(base) {
  const used = new Set(db.orders.filter((o) => o.status === 'pending').map((o) => o.amount));
  const tries = [...Array(99).keys()].map((i) => i + 1).sort(() => Math.random() - 0.5);
  for (const k of tries) if (!used.has(base + k)) return k;
  return 0;
}

// 입금 알림 문구에서 금액과 입금자 추출
function parseDeposit(text) {
  const t = String(text).split(/잔액|잔고/)[0];
  const m = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
  if (!m) return null;
  const amount = parseInt(m[1].replace(/,/g, ''), 10);
  const s = t.match(/([가-힣A-Za-z*]{2,10})\s*님/) || t.slice(m.index + m[0].length).match(/([가-힣A-Za-z*]{2,10})/);
  return { amount, sender: s ? s[1] : '' };
}

function markPaid(o, how) {
  o.status = 'paid'; o.paidAt = now(); o.paidBy = how;
  if (o.code) { const c = db.codes.find((x) => x.code === o.code); if (c) c.used++; }
}

function handleDeposit(text, source) {
  expire();
  const p = parseDeposit(text);
  const dep = { id: id(), raw: String(text).slice(0, 300), source, receivedAt: now(), amount: p ? p.amount : null, sender: p ? p.sender : '', orderId: null };
  if (p) {
    let cands = db.orders.filter((o) => o.status === 'pending' && o.amount === p.amount);
    if (cands.length > 1) cands = cands.filter((o) => text.includes(o.no));
    if (cands.length === 1) { markPaid(cands[0], 'auto'); dep.orderId = cands[0].id; }
  }
  db.deposits.unshift(dep); db.seller.lastDepositAt = dep.receivedAt; save();
  return dep;
}

const pub = (s) => s && { name: s.bizName || s.name, version: s.version, bank: s.bank, account: s.account, holder: s.holder ? s.holder[0] + '*'.repeat(Math.max(1, s.holder.length - 1)) : '', tossId: s.tossId, kakaoLink: s.kakaoLink, bizNo: s.version === 'biz' ? s.bizNo : '' };
const orderView = (o) => o && { ...o, product: db.products.find((p) => p.id === o.productId), seller: pub(db.seller) };

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const body = m === 'GET' ? {} : await readBody(req);
  // 세팅
  if (p === '/api/setup' && m === 'POST') {
    if (db.seller && !isAdmin(req)) return send(res, 403, { error: '이미 세팅됨' });
    const keep = db.seller || { adminKey: id(12), webhookToken: id(8), createdAt: now() };
    db.seller = { ...keep, ...pick(body, ['name', 'version', 'bank', 'account', 'holder', 'tossId', 'kakaoLink', 'bizNo', 'bizName', 'cashReceipt']) };
    save(); return send(res, 200, db.seller);
  }
  if (p === '/api/state' && m === 'GET') return send(res, 200, { ready: !!db.seller });
  // 구매자용
  let mm;
  if ((mm = p.match(/^\/api\/public\/product\/(\w+)$/))) {
    const pr = db.products.find((x) => x.id === mm[1] && !x.deleted);
    return pr ? send(res, 200, { product: pr, seller: pub(db.seller) }) : send(res, 404, { error: '상품 없음' });
  }
  if (p === '/api/quote' && m === 'POST') {
    const pr = db.products.find((x) => x.id === body.productId); if (!pr) return send(res, 404, { error: '상품 없음' });
    const q = price(pr, clampQty(body.qty, pr), body.code); return send(res, q.error ? 400 : 200, q);
  }
  if (p === '/api/orders' && m === 'POST') {
    expire();
    const pr = db.products.find((x) => x.id === body.productId); if (!pr) return send(res, 404, { error: '상품 없음' });
    const qty = body.test ? 1 : clampQty(body.qty, pr), q = body.test ? { subtotal: 1000, discount: 0, label: '', code: '', base: 1000 } : price(pr, qty, body.code); if (q.error) return send(res, 400, q);
    const k = offset(q.base);
    const o = { id: id(), no: 'HS' + String(db.orders.length + 1).padStart(2, '0'), productId: pr.id, qty, unitPrice: pr.price, ...q, check: k, amount: q.base + k, status: 'pending', method: body.method || 'transfer', createdAt: now(), test: !!body.test };
    db.orders.unshift(o); save(); return send(res, 200, orderView(o));
  }
  if ((mm = p.match(/^\/api\/orders\/(\w+)$/)) && m === 'GET') { expire(); const o = db.orders.find((x) => x.id === mm[1]); return o ? send(res, 200, orderView(o)) : send(res, 404, { error: '주문 없음' }); }
  if ((mm = p.match(/^\/api\/orders\/(\w+)\/cash-receipt$/)) && m === 'POST') {
    const o = db.orders.find((x) => x.id === mm[1]); if (!o || db.seller.version !== 'biz') return send(res, 400, { error: '현금영수증은 사업자 판매자만 가능해요' });
    o.cashReceipt = { type: body.type === 'expense' ? 'expense' : 'income', number: String(body.number || '').replace(/[^0-9]/g, ''), requestedAt: now(), issued: false };
    save(); return send(res, 200, o);
  }
  // 입금 알림 웹훅 (MacroDroid / 단축어)
  if (p === '/api/deposit' && m === 'POST') {
    if (!db.seller || url.searchParams.get('token') !== db.seller.webhookToken) return send(res, 403, { error: 'token' });
    const text = body.text || [body.title, body.body].filter(Boolean).join(' ');
    return send(res, 200, handleDeposit(text, body.source || 'webhook'));
  }
  // 이하 판매자 전용
  if (!isAdmin(req)) return send(res, 401, { error: '판매자 키 필요' });
  if (p === '/api/seller') return send(res, 200, db.seller);
  if (p === '/api/products' && m === 'GET') return send(res, 200, db.products.filter((x) => !x.deleted));
  if (p === '/api/products' && m === 'POST') {
    const pr = { id: id(4), name: body.name, price: parseInt(body.price, 10) || 0, noDiscount: !!body.noDiscount, maxQty: parseInt(body.maxQty, 10) || 10, images: [] };
    for (const d of (body.images || []).slice(0, 5)) { const mt = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(d); if (mt) { const f = id() + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]); fs.writeFileSync(path.join(UP, f), Buffer.from(mt[2], 'base64')); pr.images.push('/uploads/' + f); } }
    db.products.push(pr); save(); return send(res, 200, pr);
  }
  if ((mm = p.match(/^\/api\/products\/(\w+)$/)) && m === 'DELETE') { const pr = db.products.find((x) => x.id === mm[1]); if (pr) pr.deleted = true; save(); return send(res, 200, { ok: true }); }
  if (p === '/api/codes' && m === 'GET') return send(res, 200, db.codes);
  if (p === '/api/codes' && m === 'POST') {
    const code = String(body.code || '').trim(); if (!code || db.codes.some((c) => c.code.toUpperCase() === code.toUpperCase())) return send(res, 400, { error: '코드가 비었거나 이미 있어요' });
    const c = { code, type: body.type === 'amount' ? 'amount' : 'percent', value: parseInt(body.value, 10) || 0, label: body.label || '할인', maxUses: parseInt(body.maxUses, 10) || 0, used: 0, active: true };
    db.codes.push(c); save(); return send(res, 200, c);
  }
  if ((mm = p.match(/^\/api\/codes\/(.+)$/)) && m === 'PATCH') { const c = db.codes.find((x) => x.code === decodeURIComponent(mm[1])); if (c) c.active = !!body.active; save(); return send(res, 200, c || {}); }
  if (p === '/api/dashboard') {
    expire();
    const paid = db.orders.filter((o) => o.status === 'paid' && !o.test);
    return send(res, 200, { seller: db.seller, orders: db.orders.slice(0, 100).map(orderView), deposits: db.deposits.slice(0, 50), stats: { sales: paid.reduce((a, o) => a + o.amount, 0), count: paid.length, discount: paid.reduce((a, o) => a + o.discount, 0) } });
  }
  if ((mm = p.match(/^\/api\/orders\/(\w+)\/approve$/)) && m === 'POST') { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.status !== 'paid') markPaid(o, body.cash ? 'cash' : 'manual'); save(); return send(res, 200, o || {}); }
  if ((mm = p.match(/^\/api\/deposits\/(\w+)\/link$/)) && m === 'POST') {
    const d = db.deposits.find((x) => x.id === mm[1]), o = db.orders.find((x) => x.id === body.orderId);
    if (!d || !o) return send(res, 404, { error: '없음' }); markPaid(o, 'linked'); d.orderId = o.id; save(); return send(res, 200, o);
  }
  if ((mm = p.match(/^\/api\/orders\/(\w+)\/cash-receipt-issued$/)) && m === 'POST') { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.cashReceipt) o.cashReceipt.issued = true; save(); return send(res, 200, o || {}); }
  if (p === '/api/simulate-deposit' && m === 'POST') return send(res, 200, handleDeposit(body.text, 'simulate'));
  send(res, 404, { error: 'not found' });
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const clampQty = (q, pr) => Math.max(1, Math.min(pr.maxQty || 10, parseInt(q, 10) || 1));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = url.pathname === '/' ? '/seller.html' : url.pathname;
    const base = f.startsWith('/uploads/') ? DATA : path.join(__dirname, 'public');
    const fp = path.normalize(path.join(base, f));
    if (!fp.startsWith(base) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, fs.readFileSync(fp), TYPES[path.extname(fp)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, { error: '서버 오류' }); }
}).listen(PORT, () => console.log('굿즈 결제 서버: http://localhost:' + PORT));
module.exports = { parseDeposit };
