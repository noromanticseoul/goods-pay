const app = $('#app');
const W = { step: 0, start: Date.now(), d: { version: 'none' } }; // 세팅 마법사 상태
const TIMES = ['약 3분', '약 2분 30초', '약 1분 30초', '약 1분'];
let tab = 'dash', poll;
const origin = location.origin;
// 계좌 붙여넣기: "토스뱅크 1000-1234-5678" → 은행 자동 선택 + 번호만 남김
const BANK_ALIAS = [['토스', '토스뱅크'], ['카카오', '카카오뱅크'], ['케이뱅크', '케이뱅크'], ['k뱅크', '케이뱅크'], ['kbank', '케이뱅크'], ['국민', '국민은행'], ['kb', '국민은행'], ['신한', '신한은행'], ['우리', '우리은행'], ['하나', '하나은행'], ['농협', '농협은행'], ['nh', '농협은행'], ['기업', '기업은행'], ['ibk', '기업은행'], ['새마을', '새마을금고'], ['mg', '새마을금고'], ['우체국', '우체국'], ['제일', 'SC제일은행'], ['sc', 'SC제일은행'], ['수협', '수협은행'], ['부산', '부산은행'], ['대구', '대구은행'], ['im뱅크', '대구은행'], ['광주', '광주은행'], ['전북', '전북은행'], ['경남', '경남은행'], ['신협', '신협']];
function parseAccount(t) {
  const low = String(t || '').toLowerCase().replace(/\s/g, ''), hit = BANK_ALIAS.find(([k]) => low.includes(k));
  const nums = String(t || '').match(/\d[\d-]*\d/g) || [], num = nums.sort((a, b) => b.replace(/-/g, '').length - a.replace(/-/g, '').length)[0] || '';
  return { bank: hit ? hit[1] : '', account: num };
}
function smartAccount(inp, sel) {
  if (!inp) return;
  inp.addEventListener('input', () => {
    if (/^[\d-]*$/.test(inp.value)) return;
    const r = parseAccount(inp.value); inp.value = r.account;
    if (r.bank && sel) { sel.value = r.bank; toast(r.bank + ' 계좌로 맞췄어요'); }
  });
}
const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', '카카오뱅크', '토스뱅크', '케이뱅크', '기업은행', '새마을금고', '우체국', 'SC제일은행', '수협은행', '부산은행', '대구은행', '광주은행', '전북은행', '경남은행', '신협'];

async function boot() {
  const st = await api('/api/state');
  if (!st.ready) return wizard();
  if (!localStorage.getItem('gp_key')) return keyLogin();
  try { await api('/api/seller'); main(); } catch { localStorage.removeItem('gp_key'); keyLogin(); }
}

function keyLogin() {
  app.innerHTML = `<h1>판매자 로그인</h1><p>세팅할 때 받은 판매자 키를 넣어주세요.</p><label class="f">판매자 키<input id="k"></label><button id="go">들어가기</button>`;
  $('#go').onclick = () => { const k = $('#k').value.trim(); localStorage.setItem('gp_key', k); localStorage.setItem('gp_shop', k.split('.')[0]); location.reload(); };
}

// ───── 3분 초기 세팅 ─────
function head(n) { return (n ? '<div class="navr"><button class="back" id="bk">← 이전</button><button class="back" id="home">처음으로</button></div>' : '') + `<div class="top"><span>${n ? n + ' / 3' : '시작 전'}</span><span>${n === 3 ? '마지막 단계' : '남은 시간 ' + TIMES[n]}</span></div><div class="bar"><div style="width:${n ? Math.round(n * 33.4) : 4}%"></div></div>`; }
function wizard() {
  const d = W.d, s = W.step; app.classList.remove('wide');
  if (s === 0) app.innerHTML = head(0) + `<h1>3분이면<br>판매 준비 끝</h1><p>사업자등록이나 카드 단말기 없이, 지금 쓰는 계좌로 바로 받아요.</p>
    <div class="card"><p>1. 굿즈 사진과 가격을 올리면 가게 QR 하나가 생겨요</p><p>2. 손님은 QR을 찍고 원하는 굿즈를 골라 송금해요</p><p>3. 손님이 "송금했어요"를 누르면 결제 완료, 판매 목록에 바로 쌓여요</p></div>
    <div class="card"><b>준비물</b><p>받을 계좌번호 · 굿즈 사진과 가격 (지금 찍어도, 나중에 올려도 돼요)</p></div><div class="sp"></div><button id="nx">시작하기</button><button class="b2" id="login">이미 가게가 있어요 (판매자 키로 로그인)</button>`;
  if (s === 0) $('#login').onclick = keyLogin;
  if (s === 1) {
    app.innerHTML = head(1) + `<h1>판매 정보를<br>알려주세요</h1><label class="f">판매자 이름<input id="name" value="${esc(d.name || '')}" placeholder="예: homesick 굿즈"></label>
    <div class="f" style="font-size:13px;font-weight:600">어떤 버전으로 시작할까요?</div>
    <button class="vc ${d.version === 'none' ? 'on' : ''}" data-v="none"><span class="vh">사업자 없는 버전<span class="tag tg">오늘 바로</span></span><span class="small mute">송금 결제 · 할인 코드 · 구매 영수증 · 매출 목록</span></button>
    <button class="vc ${d.version === 'biz' ? 'on' : ''}" data-v="biz"><span class="vh">사업자 있는 버전<span class="tag to">심사 필요</span></span><span class="small mute">위 기능 + 카드 결제 · 현금영수증. 카드 결제는 PG 심사에 수일~2주 걸려요. 그동안은 송금으로 판매돼요.</span></button>
    <div id="biz" class="${d.version === 'biz' ? '' : 'hide'}" style="display:flex;flex-direction:column;gap:12px"><label class="f">사업자등록번호<input id="bizNo" inputmode="numeric" value="${esc(d.bizNo || '')}" placeholder="123-45-67890"></label><label class="f">상호<input id="bizName" value="${esc(d.bizName || '')}"></label>
    <div class="warn">카드 결제는 세팅이 끝난 뒤 설정에서 신청해요. 심사가 끝나기 전까지는 송금으로 판매돼요.</div></div>
    <p class="small">고민되면 없는 버전으로 시작하세요. 설정에서 언제든 바꿀 수 있어요.</p><div class="sp"></div><button id="nx">다음</button>`;
    app.querySelectorAll('.vc').forEach((b) => (b.onclick = () => { d.name = $('#name').value; d.version = b.dataset.v; wizard(); }));
  }
  if (s === 2) app.innerHTML = head(2) + `<h1>돈 받을 계좌를<br>알려주세요</h1>
    <label class="f">은행<select id="bank">${BANKS.map((b) => `<option ${d.bank === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
    <label class="f">계좌번호<input id="account" inputmode="numeric" value="${esc(d.account || '')}"></label>
    <label class="f">예금주<input id="holder" value="${esc(d.holder || d.bizName || '')}"></label>
    <div class="card"><b style="font-size:14px">있으면 더 편해요 <span class="mute">(선택)</span></b>
    <label class="f">토스 아이디 <span class="mute small">toss.me/ 뒤 이름</span><input id="tossId" value="${esc(d.tossId || '')}"></label>
    <label class="f">카카오페이 송금 링크<input id="kakaoLink" value="${esc(d.kakaoLink || '')}" placeholder="https://qr.kakaopay.com/..."></label></div><div class="sp"></div><button id="nx">다음</button>`;
  if (s === 2) smartAccount($('#account'), $('#bank'));
  if (s === 3) {
    W.items = W.items || [];
    app.innerHTML = head(3) + `<h1>팔 굿즈를<br>올려볼까요?</h1><p>나중에 상품 탭에서 언제든 추가할 수 있어요.</p>` + (W.items.map((p) => `<div class="li">${thumb(p)}<div class="t">${esc(p.name)}<small>${won(p.price)}</small></div></div>`).join('') || '<div class="card"><p>아직 올린 굿즈가 없어요.</p></div>') +
      `<button class="b2" id="addp">+ 굿즈 추가</button><div class="sp"></div><button id="nx">${W.items.length ? '다음' : '건너뛰고 다음'}</button>`;
    $('#addp').onclick = () => { app.innerHTML = NAV + '<h1>새 굿즈</h1>' + productForm(); bindNav(wizard, () => { W.step = 0; wizard(); }); bindProductForm((p) => { W.items.push(p); wizard(); }); };
    $('#nx').onclick = () => { W.step = 4; wizard(); }; bindBack(); return;
  }
  if (s === 4) { finish(); return; }
  const nx = $('#nx'); if (nx) nx.onclick = next; bindBack();
}
const NAV = '<div class="navr"><button class="back" id="bk2">← 이전</button><button class="back" id="home">처음으로</button></div>';
function bindNav(back, home) { $('#bk2').onclick = back; $('#home').onclick = home; }
const toDash = () => { tab = 'dash'; render(); };
function bindBack() { const h = $('#home'); if (h) h.onclick = () => { clearInterval(poll); W.step = 0; wizard(); }; const b = $('#bk'); if (b) b.onclick = () => { clearInterval(poll); W.step = Math.max(0, W.step - 1); wizard(); }; }
async function next() {
  const d = W.d, v = (k) => $('#' + k)?.value?.trim();
  if (W.step === 1) { d.name = v('name'); if (!d.name) return toast('판매자 이름을 넣어주세요'); if (d.version === 'biz') { d.bizNo = v('bizNo'); d.bizName = v('bizName'); if ((d.bizNo || '').replace(/\D/g, '').length !== 10) return toast('사업자등록번호 10자리를 확인해주세요'); } }
  if (W.step === 2) {
    Object.assign(d, { bank: v('bank'), account: v('account'), holder: v('holder'), tossId: v('tossId').replace(/^https?:\/\/toss\.me\//, ''), kakaoLink: v('kakaoLink') });
    if (!d.account || !d.holder) return toast('계좌번호와 예금주를 넣어주세요');
    const s = await api('/api/setup', { body: d }); localStorage.setItem('gp_key', s.adminKey); localStorage.setItem('gp_shop', s.shopId);d.shopId = s.shopId;
  }
  W.step++; wizard();
}
function finish() {
  const sec = Math.round((Date.now() - W.start) / 1000);
  app.innerHTML = `<div class="sp"></div><div class="check"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
   <h1 style="text-align:center">세팅 완료</h1><p style="text-align:center">${sec < 60 ? '1분도 안 걸렸어요' : Math.floor(sec / 60) + '분 ' + (sec % 60) + '초 걸렸어요'}. 이제 가게 QR을 띄우고 판매를 시작하세요.</p>
   <div class="card"><p>손님이 QR을 찍고 굿즈를 골라 송금한 뒤 "송금했어요"를 누르면, 결제 완료 화면이 뜨고 대시보드 판매 목록에 바로 쌓여요.</p></div><div class="sp"></div>
   <button id="start">판매 시작</button>`;
  $('#start').onclick = () => { tab = 'prod'; main(); };
}

// ───── 상품 등록 폼 (촬영 / 앨범) ─────
function productForm() {
  return `<div id="pics" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
  <div style="display:flex;gap:8px"><label class="btn b2" style="flex:1">사진 촬영<input id="cam" type="file" accept="image/*" capture="environment" hidden></label><label class="btn b2" style="flex:1">앨범에서 선택<input id="alb" type="file" accept="image/*" multiple hidden></label></div>
  <div class="f" style="font-size:13px;font-weight:600">사진 대신 이모지 <span class="mute small">선택 · 사진이 있으면 사진이 먼저 보여요</span></div>
  <div class="eg" id="eg">${['🎁','🖼️','✉️','🏷️','🔑','📓','☕','👕','🧢','👜','🎧','📱','🧸','🌸','⭐','💌','🎨','✏️','🧵','🍪','🍰','🪩','🎀','📸'].map((e) => `<button type="button" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
  <label class="f"><input id="pe" placeholder="직접 입력 · 이모지 키보드로 한 글자" maxlength="8" style="text-align:center;font-size:20px"></label>
  <label class="f">상품명<input id="pn"></label><label class="f">가격 (원)<input id="pp" inputmode="numeric"></label>
  <label class="row" style="font-size:14px"><span>할인 코드 적용 <span class="mute small">한정판이면 끄기</span></span><input id="pd" type="checkbox" checked style="width:22px;height:22px"></label>
  <label class="f">최대 구매 수량<input id="pq" inputmode="numeric" value="10"></label><div class="sp"></div><button id="psave">등록하기</button>`;
}
function bindProductForm(done) {
  const imgs = []; // { src: 미리보기, data: 줄인 사진 }
  const draw = () => { $('#pics').innerHTML = imgs.map((m, i) => `<div style="position:relative"><img class="th" style="width:100%;height:auto;aspect-ratio:1;object-fit:cover" src="${m.src}" alt="고른 사진 ${i + 1}"><button class="b3 sm" data-rm="${i}" aria-label="사진 빼기" style="position:absolute;top:4px;right:4px;height:26px;padding:0 8px">✕</button>${m.data ? `<button class="b3 sm" data-crop="${i}" style="position:absolute;left:4px;bottom:4px;height:26px;padding:0 8px">자르기</button>` : '<span class="small" style="position:absolute;left:6px;bottom:4px;color:#fff;text-shadow:0 1px 2px #000">준비 중</span>'}</div>`).join(''); $('#pics').querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { imgs.splice(+x.dataset.rm, 1); draw(); })); $('#pics').querySelectorAll('[data-crop]').forEach((x) => (x.onclick = async () => { const m = imgs[+x.dataset.crop]; const d = await cropImage(m.orig || m.data); if (d) { m.data = d; m.src = d; draw(); } })); };
  const add = (fl) => { const files = [...fl]; for (const f of files.slice(0, 5 - imgs.length)) { const m = { src: URL.createObjectURL(f), data: '' }; imgs.push(m); shrink(f).then(async (d) => { m.orig = d; m.data = d; m.src = d; draw(); if (files.length === 1) { const c = await cropImage(d); if (c) { m.data = c; m.src = c; draw(); } } }).catch(() => { imgs.splice(imgs.indexOf(m), 1); draw(); toast('이 사진은 열 수 없어요. 다른 사진을 골라주세요'); }); } draw(); };
  const setE = (v) => { $('#pe').value = v; document.querySelectorAll('#eg button').forEach((b) => b.classList.toggle('on', b.dataset.e === v)); };
  document.querySelectorAll('#eg button').forEach((b) => (b.onclick = () => setE($('#pe').value === b.dataset.e ? '' : b.dataset.e)));
  $('#pe').oninput = () => { const t = $('#pe').value.trim(); document.querySelectorAll('#eg button').forEach((b) => b.classList.toggle('on', b.dataset.e === t)); };
  $('#cam').onchange = (e) => { add(e.target.files); e.target.value = ''; }; $('#alb').onchange = (e) => { add(e.target.files); e.target.value = ''; };
  $('#psave').onclick = async () => {
    if (imgs.some((m) => !m.data)) return toast('사진을 준비하는 중이에요. 잠시 후 눌러주세요');
    const body = { name: $('#pn').value.trim(), price: $('#pp').value.replace(/\D/g, ''), noDiscount: !$('#pd').checked, maxQty: $('#pq').value, images: imgs.map((m) => m.data), emoji: $('#pe').value.trim() };
    if (!body.name || !body.price) return toast('상품명과 가격을 넣어주세요');
    $('#psave').disabled = true; $('#psave').textContent = '올리는 중…';
    try { done(await api('/api/products', { body })); } catch (e) { toast(e.message); $('#psave').disabled = false; $('#psave').textContent = '등록하기'; }
  };
}

// ───── 사진 자르기 (정사각형, 끌어서 위치 · 확대) ─────
function cropImage(src) {
  return new Promise((ok) => {
    const img = new Image(); img.onload = () => {
      const ov = document.createElement('div'); ov.className = 'crop';
      ov.innerHTML = `<div class="cbox"><b style="font-size:18px">사진 자르기</b><p class="small">끌어서 위치를 옮기고, 아래 막대나 두 손가락으로 확대해요. 손님 화면에는 이 네모 안만 보여요.</p>
      <div class="cv" id="cv"><img id="ci" src="${src}" alt="" draggable="false"></div><input type="range" id="cz" min="1" max="4" step="0.01" value="1" aria-label="확대">
      <div style="display:flex;gap:8px"><button class="b2" id="cx">자르지 않기</button><button id="cok">이대로 쓰기</button></div></div>`;
      document.body.append(ov);
      const V = $('#cv').clientWidth, base = Math.max(V / img.width, V / img.height); let z = 1, x = 0, y = 0;
      const ci = $('#ci'), put = () => { const w = img.width * base * z, h = img.height * base * z; x = Math.min(0, Math.max(V - w, x)); y = Math.min(0, Math.max(V - h, y)); ci.style.cssText = `width:${w}px;height:${h}px;transform:translate(${x}px,${y}px)`; };
      x = (V - img.width * base) / 2; y = (V - img.height * base) / 2; put();
      const zoom = (nz, cx = V / 2, cy = V / 2) => { nz = Math.min(4, Math.max(1, nz)); x = cx - ((cx - x) * nz) / z; y = cy - ((cy - y) * nz) / z; z = nz; $('#cz').value = z; put(); };
      $('#cz').oninput = (e) => zoom(+e.target.value);
      const pts = new Map(); let pd = 0;
      const cv = $('#cv');
      cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); };
      cv.onpointermove = (e) => { if (!pts.has(e.pointerId)) return; const [px, py] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pd) zoom(z * (d / pd)); pd = d; } else { x += e.clientX - px; y += e.clientY - py; put(); } };
      cv.onpointerup = cv.onpointercancel = (e) => { pts.delete(e.pointerId); pd = 0; };
      cv.onwheel = (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); };
      const close = (v) => { ov.remove(); ok(v); };
      $('#cx').onclick = () => close(null);
      $('#cok').onclick = () => { const k = 1 / (base * z), c = document.createElement('canvas'), S = Math.min(1024, Math.round(V * k)); c.width = c.height = S; c.getContext('2d').drawImage(img, -x * k, -y * k, V * k, V * k, 0, 0, S, S); close(c.toDataURL('image/jpeg', 0.85)); };
    };
    img.onerror = () => ok(null); img.src = src;
  });
}

// ───── 판매 중 화면 ─────
function main() {
  clearInterval(poll); app.classList.add('wide');
  app.innerHTML = `<div class="row"><h1>판매 관리</h1></div>
  <div class="tabs"><button data-t="dash">대시보드</button><button data-t="prod">상품</button><button data-t="code">쿠폰·할인</button><button data-t="set">설정</button></div><div id="body" style="display:flex;flex-direction:column;gap:14px"></div>`;
  app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(); }));
  render(); poll = setInterval(() => tab === 'dash' && render(), 4000);
}
let RT = 0;
async function render() {
  const rt = ++RT, stale = () => rt !== RT;
  app.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const B = $('#body');
  if (tab === 'dash') {
    const d = await api('/api/dashboard'); if (stale()) return;
    const crq = d.orders.filter((o) => o.cashReceipt && !o.cashReceipt.issued);
    B.innerHTML = `<div style="display:flex;gap:10px"><div class="card" style="flex:1"><p class="small">매출</p><b style="font-size:19px">${won(d.stats.sales)}</b></div><div class="card" style="flex:1"><p class="small">판매</p><b style="font-size:19px">${d.stats.count}건</b></div></div>
    ${crq.length ? `<div class="card"><b>현금영수증 요청 ${crq.length}건</b><p class="small">홈택스에서 발행한 뒤 완료를 눌러주세요.</p>${crq.map((o) => `<div class="row"><span>${o.no} · ${won(o.amount)} · ${o.cashReceipt.type === 'expense' ? '지출증빙' : '소득공제'} ${esc(o.cashReceipt.number)}</span><button class="b3 sm" data-cr="${o.id}">완료</button></div>`).join('')}</div>` : ''}
    <div>${d.orders.filter((o) => !o.test).slice(0, 30).map((o) => `<div class="li">${thumb(o.items?.[0] || {})}<div class="t">${esc(o.title)} · ${o.no}<small>${won(o.amount)} · ${time(o.createdAt)}${o.code ? ' · 코드 ' + esc(o.code) : ''}</small></div>${badge(o)}</div>`).join('') || '<p>아직 주문이 없어요.</p>'}</div>`;
    B.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = async () => { await api(`/api/orders/${b.dataset.cr}/cash-receipt-issued`, { body: {} }); render(); }));
  }
  if (tab === 'prod') {
    const [ps, me] = await Promise.all([api('/api/products'), api('/api/seller')]), url = shopUrl(me.shopId); if (stale()) return;
    B.innerHTML = `<div class="cols"><div class="c2 sticky"><div class="card" style="align-items:center;text-align:center"><b style="font-size:17px">가게 QR 하나로 모든 굿즈를 팔아요</b><p class="small">손님이 찍으면 굿즈 목록이 열리고, 골라서 한 번에 결제해요.</p><div class="qr" id="sq"></div>
    <div style="display:flex;gap:8px;width:100%"><a class="btn b3" style="flex:1;height:50px" href="qr.html?s=${me.shopId}&mode=show" target="_blank">크게 띄우기</a><a class="btn b3" style="flex:1;height:50px" href="qr.html?s=${me.shopId}&mode=print" target="_blank">A4로 인쇄</a></div>
    <div style="display:flex;gap:8px;width:100%"><button class="b2" id="sqdl">QR 이미지 저장</button><a class="btn b2" href="${url}" target="_blank">손님 화면 보기</a></div></div></div>
    <div class="c1"><h2>굿즈 ${ps.length}개</h2><div>` + ps.map((p) => `<div class="li">${thumb(p)}<div class="t">${esc(p.name)}<small>${won(p.price)}${p.noDiscount ? ' · 할인 제외' : ''} · 최대 ${p.maxQty}개</small></div><button class="b3 sm" data-del="${p.id}">내리기</button></div>`).join('') + `</div><button id="addp">+ 굿즈 추가</button></div></div>`;
    const c = qrCanvas(url, 220); c.setAttribute('aria-label', '가게 결제 QR'); $('#sq').append(c);
    $('#sqdl').onclick = () => { const a = document.createElement('a'); a.download = `가게QR_${me.name || me.shopId}.png`; a.href = qrCanvas(url, 1000).toDataURL(); a.click(); };
    B.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('이 굿즈를 내릴까요?')) { await api('/api/products/' + b.dataset.del, { method: 'DELETE' }); render(); } }));
    $('#addp').onclick = () => { B.innerHTML = NAV + '<h2>새 굿즈 등록</h2>' + productForm(); bindNav(render, toDash); bindProductForm(() => render()); };
  }
  if (tab === 'code') {
    const [cs, bds, pps] = await Promise.all([api('/api/codes'), api('/api/bundles'), api('/api/products')]); if (stale()) return;
    const pn = (id) => pps.find((p) => p.id === id)?.name || '(내린 굿즈)';
    B.innerHTML = `<p class="small">손님이 결제 직전 "할인 및 쿠폰" 칸에 입력하는 코드예요. 지인에게만 말이나 문자로 알려주세요.</p>` + (cs.map((c) => `<div class="card"><div class="row"><b style="font-size:18px">${esc(c.code)}</b><label><input type="checkbox" data-c="${esc(c.code)}" ${c.active ? 'checked' : ''} style="width:22px;height:22px" aria-label="코드 켜기"></label></div><div class="row"><span>${esc(c.label)}</span><span>${c.type === 'percent' ? c.value + '%' : won(c.value)} 할인</span></div><div class="row small"><span>사용 ${c.used}회 · ${c.maxUses ? '최대 ' + c.maxUses + '회' : '무제한'}</span></div></div>`).join('') || '<div class="card"><p>아직 만든 할인 코드가 없어요.</p></div>') + `<button id="addc">+ 코드 추가</button>
    <h2 style="margin-top:12px">결합 할인</h2><p class="small">고른 굿즈를 모두 담으면 코드 없이 자동으로 할인돼요. 코드와 겹치지 않고 더 큰 할인 하나만 적용돼요.</p>` + (bds.map((d) => `<div class="card"><div class="row"><b style="font-size:17px">${esc(d.name)}</b><label><input type="checkbox" data-b="${d.id}" ${d.active ? 'checked' : ''} style="width:22px;height:22px" aria-label="결합 할인 켜기"></label></div><p class="small">${(d.items || d.productIds.map((id) => ({ productId: id, qty: 1 }))).map((x) => esc(pn(x.productId)) + ' ×' + x.qty).join(' + ')}</p><div class="row"><span>${d.type === 'percent' ? d.value + '%' : won(d.value)} 할인 (세트당)</span><button class="b3 sm" data-bd="${d.id}">삭제</button></div></div>`).join('') || '<div class="card"><p>아직 만든 결합 할인이 없어요.</p></div>') + `<button id="addb" class="b2">+ 결합 할인 추가</button>`;
    B.querySelectorAll('[data-b]').forEach((x) => (x.onchange = () => api('/api/bundles/' + x.dataset.b, { method: 'PATCH', body: { active: x.checked } })));
    B.querySelectorAll('[data-bd]').forEach((x) => (x.onclick = async () => { if (confirm('이 결합 할인을 삭제할까요?')) { await api('/api/bundles/' + x.dataset.bd, { method: 'DELETE' }); render(); } }));
    $('#addb').onclick = () => {
      const ok = pps.filter((p) => !p.noDiscount);
      B.innerHTML = NAV + `<h2>새 결합 할인</h2><p class="small">함께 담았을 때 할인할 굿즈와 수량을 정해주세요. + 로 수량을 넣고, 2종류 이상 골라야 해요. 예: 엽서 ×2 + 스티커 ×1. 할인 제외 굿즈는 고를 수 없어요.</p>
      <div class="card">${ok.map((p) => `<div class="row" style="font-size:15px"><span>${esc(p.name)} <span class="mute small">${won(p.price)}</span></span><div class="stp"><button data-bm="${p.id}" aria-label="${esc(p.name)} 수량 줄이기">−</button><b data-bq="${p.id}" style="min-width:44px">0</b><button data-bpl="${p.id}" aria-label="${esc(p.name)} 수량 늘리기">+</button></div></div>`).join('') || '<p>할인을 쓸 수 있는 굿즈가 아직 없어요.</p>'}</div>
      <label class="f">이름 · 손님에게 보일 이름<input id="bn" value="세트 할인"></label>
      <div class="row"><select id="bt" style="width:40%"><option value="percent">비율 %</option><option value="amount">금액 원</option></select><input id="bv" inputmode="numeric" placeholder="10" style="width:58%"></div><p class="small">금액은 세트 하나당 깎는 값이에요. 세트를 2번 담으면 2번 깎여요. 예: 엽서 ×2 + 스티커 ×1 묶음에 엽서 4개 + 스티커 2개를 담으면 2세트예요.</p><div class="sp"></div><button id="bs">저장</button>`;
      bindNav(render, toDash);
      const qty = {}; const show = (id) => (B.querySelector(`[data-bq="${id}"]`).textContent = qty[id] ? '×' + qty[id] : '0');
      B.querySelectorAll('[data-bpl]').forEach((x) => (x.onclick = () => { const id = x.dataset.bpl; qty[id] = Math.min(20, (qty[id] || 0) + 1); show(id); }));
      B.querySelectorAll('[data-bm]').forEach((x) => (x.onclick = () => { const id = x.dataset.bm; qty[id] = Math.max(0, (qty[id] || 0) - 1); show(id); }));
      $('#bs').onclick = async () => { try { await api('/api/bundles', { body: { name: $('#bn').value, items: Object.entries(qty).filter(([, q]) => q > 0).map(([productId, q]) => ({ productId, qty: q })), type: $('#bt').value, value: $('#bv').value } }); toast('저장했어요'); render(); } catch (e) { toast(e.message); } };
    };
    B.querySelectorAll('[data-c]').forEach((x) => (x.onchange = () => api('/api/codes/' + encodeURIComponent(x.dataset.c), { method: 'PATCH', body: { active: x.checked } })));
    $('#addc').onclick = () => {
      let uses = 0;
      B.innerHTML = NAV + `<h2>새 할인 코드</h2><label class="f">코드 · 손님이 입력할 글자<input id="cc" placeholder="예: 10"></label><div class="row"><select id="ct" style="width:40%"><option value="percent">비율 %</option><option value="amount">금액 원</option></select><input id="cv" inputmode="numeric" placeholder="10" style="width:58%"></div>
      <label class="f">손님에게 보일 이름<input id="cl" value="지인 할인"></label>
      <div class="row"><span style="font-size:13px;font-weight:600">사용 횟수</span><div class="stp"><button id="um" aria-label="횟수 줄이기">−</button><b id="uv" style="min-width:64px">무제한</b><button id="up" aria-label="횟수 늘리기">+</button></div></div><p class="small">+ 를 누르면 횟수 제한이 생겨요. 끝까지 줄이면 무제한이에요.</p><div class="sp"></div><button id="cs">저장</button>`;
      const show = () => ($('#uv').textContent = uses ? uses + '회' : '무제한');
      $('#up').onclick = () => { uses = Math.min(999, uses + 1); show(); }; $('#um').onclick = () => { uses = Math.max(0, uses - 1); show(); };
      bindNav(render, toDash);
      $('#cs').onclick = async () => { try { await api('/api/codes', { body: { code: $('#cc').value, type: $('#ct').value, value: $('#cv').value, label: $('#cl').value, maxUses: uses } }); toast('저장했어요'); render(); } catch (e) { toast(e.message); } };
    };
  }
  if (tab === 'set') {
    const s = await api('/api/seller'); if (stale()) return;
    B.innerHTML = `<div class="card"><div class="row"><b>${esc(s.bizName || s.name)}</b><span class="tag ${s.version === 'biz' ? 'to' : 'tg'}">${s.version === 'biz' ? '사업자 있는 버전' : '사업자 없는 버전'}</span></div><p class="small">${esc(s.bank)} ${esc(s.account)} · ${esc(s.holder)}</p><button class="b2" id="edit">판매 정보 · 계좌 수정</button></div>
    ${s.version === 'biz' ? `<div class="card"><div class="row"><b>카드·간편결제</b><span class="tag to">PG 연동 예정</span></div><p class="small">PG 심사(수일~2주)가 끝나면 연동합니다. 그동안은 송금으로 판매돼요.</p></div>` : ''}
    <label class="f">판매자 키 (다른 기기 로그인용)<input readonly value="${esc(s.adminKey)}"></label>`;
    $('#edit').onclick = () => {
      B.innerHTML = NAV + `<h2>판매 정보 · 계좌 수정</h2><label class="f">판매자 이름<input id="e_name" value="${esc(s.name || '')}"></label>
      <label class="f">은행<select id="e_bank">${BANKS.map((b) => `<option ${s.bank === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label class="f">계좌번호<input id="e_account" inputmode="numeric" value="${esc(s.account || '')}"></label><label class="f">예금주<input id="e_holder" value="${esc(s.holder || '')}"></label>
      <label class="f">토스 아이디 <span class="mute small">선택</span><input id="e_tossId" value="${esc(s.tossId || '')}"></label><label class="f">카카오페이 송금 링크 <span class="mute small">선택</span><input id="e_kakaoLink" value="${esc(s.kakaoLink || '')}"></label>
      <p class="small">이미 송금 안내를 받은 손님은 원래 계좌를 보고 있을 수 있어요.</p><div class="sp"></div><button id="esave">저장</button>`;
      bindNav(render, toDash); smartAccount($('#e_account'), $('#e_bank'));
      $('#esave').onclick = async () => { const v = (k) => $('#e_' + k).value.trim(); const body = { name: v('name'), bank: v('bank'), account: v('account'), holder: v('holder'), tossId: v('tossId').replace(/^https?:\/\/toss\.me\//, ''), kakaoLink: v('kakaoLink') }; if (!body.name || !body.account || !body.holder) return toast('이름, 계좌번호, 예금주를 넣어주세요'); try { await api('/api/setup', { body }); toast('저장했어요'); render(); } catch (e) { toast(e.message); } };
    };
  }
}
const badge = (o) => ({ pending: '<span class="tag tb">송금 대기</span>', paid: o.code ? `<span class="tag tg">송금 완료 · ${esc(o.code)}</span>` : '<span class="tag tg">송금 완료</span>', expired: '<span class="tag tx">만료</span>' }[o.status]);
const time = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
boot();
