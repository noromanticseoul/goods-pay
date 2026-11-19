// 1인 굿즈 판매자를 위한 굿즈 결제시스템 - 공통 로직 (로컬 서버 · Netlify 함수 · 브라우저 데모가 함께 씀)
// 가게(판매자)마다 데이터 1묶음. 가게 QR 하나로 모든 굿즈를 장바구니처럼 골라 결제.
(function (root) {
  const ORDER_TTL = 15 * 60 * 1000;
  const empty = () => ({ seller: null, products: [], codes: [], orders: [], deposits: [] });
  const rnd = (n) => { const a = new Uint8Array(n); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const now = () => Date.now();
  const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

  // 입금 알림 문구에서 금액과 입금자 추출
  function parseDeposit(text) {
    const t = String(text).split(/잔액|잔고/)[0];
    const m = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
    if (!m) return null;
    const amount = parseInt(m[1].replace(/,/g, ''), 10);
    const s = t.match(/([가-힣A-Za-z*]{2,10})\s*님/) || t.slice(m.index + m[0].length).match(/([가-힣A-Za-z*]{2,10})/);
    return { amount, sender: s ? s[1] : '' };
  }

  // 한 가게의 db로 요청 1건 처리
  function run(db, req, shopId, imageUrl) {
    const p = req.url.pathname, m = req.method, body = req.body || {}, q = req.url.searchParams;
    const out = { dirty: false, images: [] };
    const send = (code, b) => Object.assign(out, { code, body: b });
    const save = () => (out.dirty = true);
    const isAdmin = () => db.seller && req.headers['x-admin-key'] === db.seller.adminKey;
    const expire = () => db.orders.forEach((o) => { if (o.status === 'pending' && now() - o.createdAt > ORDER_TTL) o.status = 'expired'; });
    const pub = (s) => s && { shopId: s.shopId, name: s.bizName || s.name, version: s.version, bank: s.bank, account: s.account, holder: s.holder ? s.holder[0] + '*'.repeat(Math.max(1, s.holder.length - 1)) : '', tossId: s.tossId, kakaoLink: s.kakaoLink, bizNo: s.version === 'biz' ? s.bizNo : '' };
    const orderView = (o) => o && { ...o, product: { name: o.title, images: o.items[0] && o.items[0].image ? [o.items[0].image] : [] }, seller: pub(db.seller) };
    const active = () => db.products.filter((x) => !x.deleted);

    // 장바구니 + 할인 코드로 금액 계산 (코드는 할인 허용 상품에만)
    function price(items, code) {
      const lines = [];
      for (const it of items || []) {
        const pr = db.products.find((x) => x.id === it.productId && !x.deleted); if (!pr) continue;
        const qty = Math.max(0, Math.min(pr.maxQty || 10, parseInt(it.qty, 10) || 0)); if (!qty) continue;
        lines.push({ productId: pr.id, name: pr.name, price: pr.price, qty, image: pr.images[0] || '', noDiscount: !!pr.noDiscount });
      }
      const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0), eligible = lines.filter((l) => !l.noDiscount).reduce((a, l) => a + l.price * l.qty, 0);
      let c = null, discount = 0;
      if (code) {
        c = db.codes.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase());
        if (!(c && c.active && (!c.maxUses || c.used < c.maxUses))) return { error: '사용할 수 없는 코드예요' };
        if (lines.length && !eligible) return { error: '할인 코드를 쓸 수 없는 상품이에요' };
        discount = c.type === 'percent' ? Math.round((eligible * c.value) / 100) : Math.min(c.value, eligible);
      }
      return { lines, subtotal, discount, label: c ? c.label : '', code: c ? c.code : '', base: subtotal - discount };
    }
    function offset(base) {
      const used = new Set(db.orders.filter((o) => o.status === 'pending').map((o) => o.amount));
      const tries = [...Array(99).keys()].map((i) => i + 1).sort(() => Math.random() - 0.5);
      for (const k of tries) if (!used.has(base + k)) return k;
      return 0;
    }
    function markPaid(o, how) { o.status = 'paid'; o.paidAt = now(); o.paidBy = how; if (o.code) { const c = db.codes.find((x) => x.code === o.code); if (c) c.used++; } }
    function handleDeposit(text, source) {
      expire();
      const d = parseDeposit(text);
      const dep = { id: rnd(6), raw: String(text).slice(0, 300), source, receivedAt: now(), amount: d ? d.amount : null, sender: d ? d.sender : '', orderId: null };
      if (d) {
        let cands = db.orders.filter((o) => o.status === 'pending' && o.amount === d.amount);
        if (cands.length > 1) cands = cands.filter((o) => text.includes(o.no));
        if (cands.length === 1) { markPaid(cands[0], 'auto'); dep.orderId = cands[0].id; }
      }
      db.deposits.unshift(dep); db.deposits = db.deposits.slice(0, 200); db.seller.lastDepositAt = dep.receivedAt; save();
      return dep;
    }

    // 세팅
    if (p === '/api/setup' && m === 'POST') {
      if (db.seller && !isAdmin()) return send(403, { error: '이미 세팅된 가게예요' });
      const keep = db.seller || { shopId, adminKey: shopId + '.' + rnd(12), webhookToken: rnd(8), createdAt: now() };
      db.seller = { ...keep, ...pick(body, ['name', 'version', 'bank', 'account', 'holder', 'tossId', 'kakaoLink', 'bizNo', 'bizName', 'cashReceipt']) };
      save(); return send(200, db.seller);
    }
    if (p === '/api/state' && m === 'GET') return send(200, { ready: !!db.seller, admin: !!isAdmin() });
    // 구매자용
    let mm;
    if (p === '/api/public/shop' && m === 'GET') return db.seller ? send(200, { seller: pub(db.seller), products: active() }) : send(404, { error: '가게를 찾을 수 없어요' });
    if (p === '/api/quote' && m === 'POST') { const r = price(body.items, body.code); return send(r.error ? 400 : 200, r); }
    if (p === '/api/orders' && m === 'POST') {
      if (!db.seller) return send(404, { error: '가게를 찾을 수 없어요' });
      expire();
      let r;
      if (body.test) { if (!isAdmin()) return send(401, { error: '판매자 키 필요' }); r = { lines: [{ productId: '', name: '테스트 결제', price: 1000, qty: 1, image: '' }], subtotal: 1000, discount: 0, label: '', code: '', base: 1000 }; }
      else r = price(body.items, body.code);
      if (r.error) return send(400, r);
      if (!r.lines.length) return send(400, { error: '굿즈를 1개 이상 골라주세요' });
      const k = offset(r.base), items = r.lines.map(({ noDiscount, ...l }) => l);
      const o = { id: rnd(6), no: 'HS' + String(db.orders.length + 1).padStart(2, '0'), items, title: items.map((l) => `${l.name} × ${l.qty}`).join(', '), qty: items.reduce((a, l) => a + l.qty, 0), subtotal: r.subtotal, discount: r.discount, label: r.label, code: r.code, base: r.base, check: k, amount: r.base + k, status: 'pending', method: body.method || 'transfer', createdAt: now(), test: !!body.test };
      db.orders.unshift(o); db.orders = db.orders.slice(0, 500); save(); return send(200, orderView(o));
    }
    if ((mm = p.match(/^\/api\/orders\/(\w+)$/)) && m === 'GET') { expire(); const o = db.orders.find((x) => x.id === mm[1]); return o ? send(200, orderView(o)) : send(404, { error: '주문 없음' }); }
    if ((mm = p.match(/^\/api\/orders\/(\w+)\/cash-receipt$/)) && m === 'POST') {
      const o = db.orders.find((x) => x.id === mm[1]); if (!o || !db.seller || db.seller.version !== 'biz') return send(400, { error: '현금영수증은 사업자 판매자만 가능해요' });
      o.cashReceipt = { type: body.type === 'expense' ? 'expense' : 'income', number: String(body.number || '').replace(/[^0-9]/g, ''), requestedAt: now(), issued: false };
      save(); return send(200, o);
    }
    // 입금 알림 웹훅 (MacroDroid / 단축어)
    if (p === '/api/deposit' && m === 'POST') {
      if (!db.seller || q.get('token') !== db.seller.webhookToken) return send(403, { error: 'token' });
      const text = body.text || [body.title, body.body].filter(Boolean).join(' ');
      return send(200, handleDeposit(text, body.source || 'webhook'));
    }
    // 이하 판매자 전용
    if (!isAdmin()) return send(401, { error: '판매자 키 필요' });
    if (p === '/api/seller') return send(200, db.seller);
    if (p === '/api/products' && m === 'GET') return send(200, active());
    if (p === '/api/products' && m === 'POST') {
      const pr = { id: rnd(4), name: String(body.name || '').slice(0, 60), price: parseInt(body.price, 10) || 0, noDiscount: !!body.noDiscount, maxQty: parseInt(body.maxQty, 10) || 10, images: [] };
      for (const d of (body.images || []).slice(0, 5)) {
        const mt = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(d); if (!mt) continue;
        const name = rnd(8) + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
        out.images.push({ name, b64: mt[2] }); pr.images.push(imageUrl ? imageUrl(name, d) : '/uploads/' + name);
      }
      db.products.push(pr); save(); return send(200, pr);
    }
    if ((mm = p.match(/^\/api\/products\/(\w+)$/)) && m === 'DELETE') { const pr = db.products.find((x) => x.id === mm[1]); if (pr) pr.deleted = true; save(); return send(200, { ok: true }); }
    if (p === '/api/codes' && m === 'GET') return send(200, db.codes);
    if (p === '/api/codes' && m === 'POST') {
      const code = String(body.code || '').trim(); if (!code || db.codes.some((c) => c.code.toUpperCase() === code.toUpperCase())) return send(400, { error: '코드가 비었거나 이미 있어요' });
      const c = { code, type: body.type === 'amount' ? 'amount' : 'percent', value: parseInt(body.value, 10) || 0, label: body.label || '할인', maxUses: parseInt(body.maxUses, 10) || 0, used: 0, active: true };
      db.codes.push(c); save(); return send(200, c);
    }
    if ((mm = p.match(/^\/api\/codes\/(.+)$/)) && m === 'PATCH') { const c = db.codes.find((x) => x.code === decodeURIComponent(mm[1])); if (c) c.active = !!body.active; save(); return send(200, c || {}); }
    if (p === '/api/dashboard') {
      expire();
      const paid = db.orders.filter((o) => o.status === 'paid' && !o.test);
      return send(200, { seller: db.seller, orders: db.orders.slice(0, 100).map(orderView), deposits: db.deposits.slice(0, 50), stats: { sales: paid.reduce((a, o) => a + o.amount, 0), count: paid.length, discount: paid.reduce((a, o) => a + o.discount, 0) } });
    }
    if ((mm = p.match(/^\/api\/orders\/(\w+)\/approve$/)) && m === 'POST') { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.status !== 'paid') markPaid(o, body.cash ? 'cash' : 'manual'); save(); return send(200, o || {}); }
    if ((mm = p.match(/^\/api\/deposits\/(\w+)\/link$/)) && m === 'POST') {
      const d = db.deposits.find((x) => x.id === mm[1]), o = db.orders.find((x) => x.id === body.orderId);
      if (!d || !o) return send(404, { error: '없음' }); markPaid(o, 'linked'); d.orderId = o.id; save(); return send(200, o);
    }
    if ((mm = p.match(/^\/api\/orders\/(\w+)\/cash-receipt-issued$/)) && m === 'POST') { const o = db.orders.find((x) => x.id === mm[1]); if (o && o.cashReceipt) o.cashReceipt.issued = true; save(); return send(200, o || {}); }
    if (p === '/api/simulate-deposit' && m === 'POST') return send(200, handleDeposit(body.text, 'simulate'));
    return send(404, { error: 'not found' });
  }

  // store: { load(shopId) -> db|null, save(shopId, db), putImage(name, b64), imageUrl?(name, dataUrl) }
  // req: { method, url: URL, headers: {소문자 키}, body }
  async function handle(store, req) {
    const key = String(req.headers['x-admin-key'] || '');
    let shop = req.url.searchParams.get('s') || key.split('.')[0] || '';
    if (!/^[a-f0-9]{8}$/.test(shop)) shop = '';
    if (!shop && req.url.pathname === '/api/setup') shop = rnd(4);
    const db = Object.assign(empty(), (shop && (await store.load(shop))) || {});
    const out = run(db, req, shop, store.imageUrl);
    for (const im of out.images) await store.putImage(im.name, im.b64);
    if (out.dirty && shop) await store.save(shop, db);
    return { code: out.code, body: out.body };
  }

  const api = { handle, parseDeposit, empty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GoodsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
