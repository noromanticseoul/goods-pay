// 데모 모드: 서버 대신 이 브라우저 안에서 같은 규칙으로 동작 (데이터는 이 브라우저에만 저장)
window.confirm = () => true;
(function () {
  const KEY = 'gp_demo_db';
  let mem = null;
  const load = () => { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem(KEY)); } catch {} return (mem = mem || { seller: null, products: [], codes: [], orders: [], deposits: [] }); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {} };
  const rid = () => Math.random().toString(16).slice(2, 14);
  const now = () => Date.now();
  const err = (m) => { throw new Error(m); };
  const expire = (db) => db.orders.forEach((o) => { if (o.status === 'pending' && now() - o.createdAt > 15 * 60000) o.status = 'expired'; });
  const price = (db, pr, qty, code) => {
    const subtotal = pr.price * qty; let c = null, discount = 0;
    if (code) { c = db.codes.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase()); if (!(c && c.active && !pr.noDiscount && (!c.maxUses || c.used < c.maxUses))) err('사용할 수 없는 코드예요'); discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal); }
    return { subtotal, discount, label: c ? c.label : '', code: c ? c.code : '', base: subtotal - discount };
  };
  const offset = (db, base) => { const used = new Set(db.orders.filter((o) => o.status === 'pending').map((o) => o.amount)); for (let i = 0; i < 200; i++) { const k = 1 + Math.floor(Math.random() * 99); if (!used.has(base + k)) return k; } return 0; };
  const parse = (text) => { const t = String(text).split(/잔액|잔고/)[0]; const m = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/); if (!m) return null; const s = t.match(/([가-힣A-Za-z*]{2,10})\s*님/) || t.slice(m.index + m[0].length).match(/([가-힣A-Za-z*]{2,10})/); return { amount: parseInt(m[1].replace(/,/g, ''), 10), sender: s ? s[1] : '' }; };
  const markPaid = (db, o, how) => { o.status = 'paid'; o.paidAt = now(); o.paidBy = how; if (o.code) { const c = db.codes.find((x) => x.code === o.code); if (c) c.used++; } };
  const deposit = (db, text, source) => { expire(db); const p = parse(text); const d = { id: rid(), raw: String(text).slice(0, 300), source, receivedAt: now(), amount: p ? p.amount : null, sender: p ? p.sender : '', orderId: null };
    if (p) { let c = db.orders.filter((o) => o.status === 'pending' && o.amount === p.amount); if (c.length > 1) c = c.filter((o) => text.includes(o.no)); if (c.length === 1) { markPaid(db, c[0], 'auto'); d.orderId = c[0].id; } }
    db.deposits.unshift(d); db.seller.lastDepositAt = d.receivedAt; return d; };
  const pub = (s) => s && { name: s.bizName || s.name, version: s.version, bank: s.bank, account: s.account, holder: s.holder ? s.holder[0] + '*'.repeat(Math.max(1, s.holder.length - 1)) : '', tossId: s.tossId, kakaoLink: s.kakaoLink, bizNo: s.version === 'biz' ? s.bizNo : '' };
  const view = (db, o) => o && { ...o, product: db.products.find((p) => p.id === o.productId), seller: pub(db.seller) };
  const clamp = (q, pr) => Math.max(1, Math.min(pr.maxQty || 10, parseInt(q, 10) || 1));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  window.api = async function (path, opt = {}) {
    const db = load(), m = opt.method || (opt.body ? 'POST' : 'GET'), b = opt.body || {}; let mm;
    const r = (() => {
      if (path === '/api/state') return { ready: !!db.seller };
      if (path === '/api/setup') { const keep = db.seller || { adminKey: 'demo-' + rid(), webhookToken: rid(), createdAt: now() }; db.seller = { ...keep, ...b }; localStorage.setItem('gp_key', db.seller.adminKey); return db.seller; }
      if ((mm = path.match(/^\/api\/public\/product\/(\w+)$/))) { const pr = db.products.find((x) => x.id === mm[1] && !x.deleted); if (!pr) err('상품 없음'); return { product: pr, seller: pub(db.seller) }; }
      if (path === '/api/quote') { const pr = db.products.find((x) => x.id === b.productId); return price(db, pr, clamp(b.qty, pr), b.code); }
      if (path === '/api/orders' && m === 'POST') { expire(db); const pr = db.products.find((x) => x.id === b.productId); const qty = b.test ? 1 : clamp(b.qty, pr); const q = b.test ? { subtotal: 1000, discount: 0, label: '', code: '', base: 1000 } : price(db, pr, qty, b.code); const k = offset(db, q.base);
        const o = { id: rid(), no: 'HS' + String(db.orders.length + 1).padStart(2, '0'), productId: pr.id, qty, unitPrice: pr.price, ...q, check: k, amount: q.base + k, status: 'pending', method: b.method || 'transfer', createdAt: now(), test: !!b.test }; db.orders.unshift(o); return view(db, o); }
      if ((mm = path.match(/^\/api\/orders\/(\w+)$/))) { expire(db); const o = db.orders.find((x) => x.id === mm[1]); if (!o) err('주문 없음'); return view(db, o); }
      if ((mm = path.match(/^\/api\/orders\/(\w+)\/cash-receipt$/))) { const o = db.orders.find((x) => x.id === mm[1]); if (!o || db.seller.version !== 'biz') err('현금영수증은 사업자 판매자만 가능해요'); o.cashReceipt = { type: b.type === 'expense' ? 'expense' : 'income', number: String(b.number || '').replace(/\D/g, ''), requestedAt: now(), issued: false }; return o; }
      if (path === '/api/seller') return db.seller;
      if (path === '/api/products' && m === 'GET') return db.products.filter((x) => !x.deleted);
      if (path === '/api/products') { const pr = { id: rid().slice(0, 8), name: b.name, price: parseInt(b.price, 10) || 0, noDiscount: !!b.noDiscount, maxQty: parseInt(b.maxQty, 10) || 10, images: (b.images || []).slice(0, 2) }; db.products.push(pr); return pr; }
      if ((mm = path.match(/^\/api\/products\/(\w+)$/))) { const pr = db.products.find((x) => x.id === mm[1]); if (pr) pr.deleted = true; return { ok: true }; }
      if (path === '/api/codes' && m === 'GET') return db.codes;
      if (path === '/api/codes') { const code = String(b.code || '').trim(); if (!code || db.codes.some((c) => c.code.toUpperCase() === code.toUpperCase())) err('코드가 비었거나 이미 있어요'); const c = { code, type: b.type === 'amount' ? 'amount' : 'percent', value: parseInt(b.value, 10) || 0, label: b.label || '할인', maxUses: parseInt(b.maxUses, 10) || 0, used: 0, active: true }; db.codes.push(c); return c; }
      if ((mm = path.match(/^\/api\/codes\/(.+)$/))) { const c = db.codes.find((x) => x.code === decodeURIComponent(mm[1])); if (c) c.active = !!b.active; return c || {}; }
      if (path === '/api/dashboard') { expire(db); const paid = db.orders.filter((o) => o.status === 'paid' && !o.test); return { seller: db.seller, orders: db.orders.slice(0, 100).map((o) => view(db, o)), deposits: db.deposits.slice(0, 50), stats: { sales: paid.reduce((a, o) => a + o.amount, 0), count: paid.length } }; }
      if ((mm = path.match(/^\/api\/orders\/(\w+)\/approve$/))) { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.status !== 'paid') markPaid(db, o, 'manual'); return o || {}; }
      if ((mm = path.match(/^\/api\/deposits\/(\w+)\/link$/))) { const d = db.deposits.find((x) => x.id === mm[1]), o = db.orders.find((x) => x.id === b.orderId); markPaid(db, o, 'linked'); d.orderId = o.id; return o; }
      if ((mm = path.match(/^\/api\/orders\/(\w+)\/cash-receipt-issued$/))) { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.cashReceipt) o.cashReceipt.issued = true; return o || {}; }
      if (path === '/api/simulate-deposit') return deposit(db, b.text, 'simulate');
      err('없는 기능이에요');
    })();
    save(); return clone(r);
  };
  // 데모 안내 바: 판매자 화면 이동, 입금 알림 흉내, 초기화
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;z-index:8;background:#191F28;color:#fff;font-size:12.5px;padding:8px max(12px,env(safe-area-inset-left,0px));display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center';
    const isBuyer = /p\.html|r\.html/.test(location.pathname);
    bar.innerHTML = `<span>데모 · 이 브라우저에만 저장돼요</span>${isBuyer ? '<a href="index.html" style="color:#9CC3FF">판매자 화면</a><button id="dm-dep" style="width:auto;height:30px;font-size:12.5px;padding:0 10px;border-radius:8px">판매자 폰에 입금 알림 보내기</button>' : '<a href="1%EC%9D%B8%20%EA%B5%BF%EC%A6%88%20%ED%8C%90%EB%A7%A4%EC%9E%90%EB%A5%BC%20%EC%9C%84%ED%95%9C%20%EA%B5%BF%EC%A6%88%20%EA%B2%B0%EC%A0%9C%EC%8B%9C%EC%8A%A4%ED%85%9C.html" style="color:#9CC3FF">발표 자료</a><a href="1%EC%9D%B8%20%EA%B5%BF%EC%A6%88%20%ED%8C%90%EB%A7%A4%EC%9E%90%EB%A5%BC%20%EC%9C%84%ED%95%9C%20%EA%B5%BF%EC%A6%88%20%EA%B2%B0%EC%A0%9C%EC%8B%9C%EC%8A%A4%ED%85%9C.pdf" download style="color:#9CC3FF">PDF 받기</a>'}<button id="dm-reset" style="width:auto;height:30px;font-size:12.5px;padding:0 10px;border-radius:8px;background:#333D4B">처음부터</button>`;
    document.body.prepend(bar);
    const dep = document.getElementById('dm-dep');
    if (dep) dep.onclick = async () => { const db = load(); const o = db.orders.find((x) => x.status === 'pending'); if (!o) return toast('먼저 결제 방법을 눌러 주문을 만들어주세요'); await window.api('/api/simulate-deposit', { body: { text: `[토스] 김민지님이 ${o.amount.toLocaleString('ko-KR')}원을 보냈어요` } }); toast('입금 알림을 보냈어요'); };
    document.getElementById('dm-reset').onclick = () => { try { localStorage.removeItem(KEY); localStorage.removeItem('gp_key'); } catch {} mem = null; location.href = 'index.html'; };
  });
})();
