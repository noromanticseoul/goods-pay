const app = $('#app');
const W = { step: 0, start: Date.now(), d: { version: 'none' } }; // 세팅 마법사 상태
const TIMES = ['약 5분', '약 4분', '약 3분 20초', '약 1분 50초', '약 1분 10초', '마지막 단계'];
let tab = 'dash', poll;
const origin = location.origin;

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

// ───── 5분 초기 세팅 ─────
function head(n) { return `<div class="top"><span>${n ? n + ' / 5' : '시작 전'}</span><span>${n === 5 ? '마지막 단계' : '남은 시간 ' + TIMES[n]}</span></div><div class="bar"><div style="width:${n ? n * 20 : 4}%"></div></div>`; }
function wizard() {
  const d = W.d, s = W.step; app.classList.remove('wide');
  if (s === 0) app.innerHTML = head(0) + `<h1>5분이면<br>판매 준비 끝</h1><p>사업자등록이나 카드 단말기 없이, 지금 쓰는 계좌로 바로 받아요.</p>
    <div class="card"><p>1. 굿즈 사진과 가격을 올리면 가게 QR 하나가 생겨요</p><p>2. 손님은 QR을 찍고 원하는 굿즈를 골라 송금해요</p><p>3. 입금 알림이 오면 자동으로 결제 완료</p></div>
    <div class="card"><b>준비물</b><p>알림 받을 휴대폰 · 받을 계좌번호 · 굿즈 1개 (사진은 지금 찍어도 돼요)</p></div><div class="sp"></div><button id="nx">시작하기</button><button class="b2" id="login">이미 가게가 있어요 (판매자 키로 로그인)</button>`;
  if (s === 0) $('#login').onclick = keyLogin;
  if (s === 1) {
    app.innerHTML = head(1) + `<h1>판매 정보를<br>알려주세요</h1><label class="f">판매자 이름<input id="name" value="${esc(d.name || '')}" placeholder="예: homesick 굿즈"></label>
    <div class="f" style="font-size:13px;font-weight:600">어떤 버전으로 시작할까요?</div>
    <button class="vc ${d.version === 'none' ? 'on' : ''}" data-v="none"><span class="vh">사업자 없는 버전<span class="tag tg">오늘 바로</span></span><span class="small mute">송금 결제 · 입금 자동 확인 · 할인 코드 · 구매 영수증</span></button>
    <button class="vc ${d.version === 'biz' ? 'on' : ''}" data-v="biz"><span class="vh">사업자 있는 버전<span class="tag to">심사 필요</span></span><span class="small mute">위 기능 + 카드 결제 · 현금영수증. 카드 결제는 PG 심사에 수일~2주 걸려요. 그동안은 송금으로 판매돼요.</span></button>
    <div id="biz" class="${d.version === 'biz' ? '' : 'hide'}" style="display:flex;flex-direction:column;gap:12px"><label class="f">사업자등록번호<input id="bizNo" inputmode="numeric" value="${esc(d.bizNo || '')}" placeholder="123-45-67890"></label><label class="f">상호<input id="bizName" value="${esc(d.bizName || '')}"></label>
    <div class="warn">카드 결제는 세팅이 끝난 뒤 설정에서 신청해요. 심사가 끝나기 전까지는 송금으로 판매돼요.</div></div>
    <p class="small">고민되면 없는 버전으로 시작하세요. 설정에서 언제든 바꿀 수 있어요.</p><div class="sp"></div><button id="nx">다음</button>`;
    app.querySelectorAll('.vc').forEach((b) => (b.onclick = () => { d.name = $('#name').value; d.version = b.dataset.v; wizard(); }));
  }
  if (s === 2) app.innerHTML = head(2) + `<h1>돈 받을 계좌를<br>알려주세요</h1>
    <label class="f">은행<select id="bank">${['국민은행','신한은행','우리은행','하나은행','농협은행','카카오뱅크','토스뱅크','케이뱅크','기업은행','새마을금고','우체국'].map((b) => `<option ${d.bank === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
    <label class="f">계좌번호<input id="account" inputmode="numeric" value="${esc(d.account || '')}"></label>
    <label class="f">예금주<input id="holder" value="${esc(d.holder || d.bizName || '')}"></label>
    <div class="card"><b style="font-size:14px">있으면 더 편해요 <span class="mute">(선택)</span></b>
    <label class="f">토스 아이디 <span class="mute small">toss.me/ 뒤 이름</span><input id="tossId" value="${esc(d.tossId || '')}"></label>
    <label class="f">카카오페이 송금 링크<input id="kakaoLink" value="${esc(d.kakaoLink || '')}" placeholder="https://qr.kakaopay.com/..."></label></div><div class="sp"></div><button id="nx">다음</button>`;
  if (s === 3) {
    const hook = `${origin}/api/deposit?s=${d.shopId}&token=${d.webhookToken}`;
    app.innerHTML = head(3) + `<h1>입금 알림을<br>연결할게요</h1><div class="tabs"><button class="on" data-t="a">안드로이드</button><button data-t="i">아이폰</button></div>
    <div id="ta" class="card"><p>1. Play 스토어에서 <b>MacroDroid</b> 설치</p><p>2. 새 매크로 · 트리거: <b>알림 수신</b> → 토스·은행 앱 선택</p><p>3. 액션: <b>HTTP 요청</b> · POST · 아래 주소 · 본문 <code>{"text":"[notification_title] [notification_text]"}</code></p><p>4. MacroDroid 알림 접근 허용, 배터리 최적화 예외</p></div>
    <div id="ti" class="card hide"><p>1. 은행 앱에서 <b>입출금 문자 알림</b> 켜기</p><p>2. 단축어 → 자동화 → <b>메시지</b> · 보낸 사람: 은행 번호</p><p>3. 동작: <b>URL 콘텐츠 가져오기</b> · POST · JSON <code>text</code> = 메시지 내용</p><p>4. "실행 전에 묻기" 끄기</p></div>
    <label class="f">웹훅 주소<input readonly value="${esc(hook)}"></label><button class="b2" id="cp">주소 복사</button><div class="sp"></div><button id="nx">다음</button>`;
    $('#cp').onclick = () => copy(hook, '웹훅 주소를 복사했어요');
    app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { app.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b)); $('#ta').classList.toggle('hide', b.dataset.t !== 'a'); $('#ti').classList.toggle('hide', b.dataset.t !== 'i'); }));
  }
  if (s === 4) { app.innerHTML = head(4) + `<h1>첫 굿즈를<br>올려볼까요?</h1>` + productForm(); bindProductForm(async (p) => { W.product = p; W.step = 5; wizard(); }); return; }
  if (s === 5) return testPay();
  const nx = $('#nx'); if (nx) nx.onclick = next;
}
async function next() {
  const d = W.d, v = (k) => $('#' + k)?.value?.trim();
  if (W.step === 1) { d.name = v('name'); if (!d.name) return toast('판매자 이름을 넣어주세요'); if (d.version === 'biz') { d.bizNo = v('bizNo'); d.bizName = v('bizName'); if ((d.bizNo || '').replace(/\D/g, '').length !== 10) return toast('사업자등록번호 10자리를 확인해주세요'); } }
  if (W.step === 2) {
    Object.assign(d, { bank: v('bank'), account: v('account'), holder: v('holder'), tossId: v('tossId').replace(/^https?:\/\/toss\.me\//, ''), kakaoLink: v('kakaoLink') });
    if (!d.account || !d.holder) return toast('계좌번호와 예금주를 넣어주세요');
    const s = await api('/api/setup', { body: d }); localStorage.setItem('gp_key', s.adminKey); localStorage.setItem('gp_shop', s.shopId); d.webhookToken = s.webhookToken; d.shopId = s.shopId;
  }
  W.step++; wizard();
}
async function testPay() {
  const o = await api('/api/orders', { body: { test: true } });
  app.innerHTML = head(5) + `<h1>${won(o.amount)}을<br>보내보세요</h1><p>다른 계좌나 지인 폰으로 아래 계좌에 정확히 보내주세요.</p>
   <div class="card"><div class="row"><span>계좌</span><b>${esc(W.d.bank)} ${esc(W.d.account)}</b></div><div class="row"><span>금액</span><b>${won(o.amount)}</b></div></div>
   <div class="card" id="chk"><p>○ 입금 알림 기다리는 중…</p></div><div class="sp"></div>
   <button class="b2" id="sim">알림 없이 시험해보기 (시뮬레이션)</button><button class="b2" id="skip">나중에 할게요 (수동 승인으로 시작)</button>`;
  $('#sim').onclick = () => api('/api/simulate-deposit', { body: { text: `테스트님이 ${won(o.amount)}을 보냈어요` } });
  $('#skip').onclick = () => { clearInterval(poll); tab = 'prod'; localStorage.setItem('gp_setup_s', '0'); main(); };
  clearInterval(poll); poll = setInterval(async () => {
    const r = await api('/api/orders/' + o.id); if (r.status !== 'paid') return;
    clearInterval(poll); const sec = Math.round((Date.now() - W.start) / 1000);
    $('#chk').innerHTML = `<p class="ok">✓ 입금 알림 받음</p><p class="ok">✓ 금액 ${won(o.amount)} 인식</p><p class="ok">✓ 결제 완료 화면 전환</p>`;
    app.querySelector('.sp').insertAdjacentHTML('beforebegin', `<div class="card" style="background:#E8F5EC"><b style="color:var(--green)">세팅 완료 · ${Math.floor(sec / 60)}분 ${sec % 60}초</b><p>이제 판매를 시작할 수 있어요.</p></div>`);
    $('#sim').remove(); $('#skip').textContent = '판매 시작'; $('#skip').className = '';
  }, 2000);
}

// ───── 상품 등록 폼 (촬영 / 앨범) ─────
function productForm() {
  return `<div id="pics" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
  <div style="display:flex;gap:8px"><label class="btn b2" style="flex:1">사진 촬영<input id="cam" type="file" accept="image/*" capture="environment" hidden></label><label class="btn b2" style="flex:1">앨범에서 선택<input id="alb" type="file" accept="image/*" multiple hidden></label></div>
  <label class="f">상품명<input id="pn"></label><label class="f">가격 (원)<input id="pp" inputmode="numeric"></label>
  <label class="row" style="font-size:14px"><span>할인 코드 적용 <span class="mute small">한정판이면 끄기</span></span><input id="pd" type="checkbox" checked style="width:22px;height:22px"></label>
  <label class="f">최대 구매 수량<input id="pq" inputmode="numeric" value="10"></label><div class="sp"></div><button id="psave">등록하기</button>`;
}
function bindProductForm(done) {
  const imgs = [];
  const add = async (files) => { for (const f of [...files].slice(0, 5 - imgs.length)) imgs.push(await shrink(f)); $('#pics').innerHTML = imgs.map((s) => `<img class="th" style="width:100%;height:90px" src="${s}" alt="">`).join(''); };
  $('#cam').onchange = (e) => add(e.target.files); $('#alb').onchange = (e) => add(e.target.files);
  $('#psave').onclick = async () => {
    const body = { name: $('#pn').value.trim(), price: $('#pp').value.replace(/\D/g, ''), noDiscount: !$('#pd').checked, maxQty: $('#pq').value, images: imgs };
    if (!body.name || !body.price) return toast('상품명과 가격을 넣어주세요');
    try { done(await api('/api/products', { body })); } catch (e) { toast(e.message); }
  };
}

// ───── 판매 중 화면 ─────
function main() {
  clearInterval(poll); app.classList.add('wide');
  app.innerHTML = `<div class="row"><h1>판매 관리</h1><span id="live" class="small"></span></div>
  <div class="tabs"><button data-t="dash">대시보드</button><button data-t="prod">상품</button><button data-t="code">할인 코드</button><button data-t="set">설정</button></div><div id="body" style="display:flex;flex-direction:column;gap:14px"></div>`;
  app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(); }));
  render(); poll = setInterval(() => tab === 'dash' && render(), 4000);
}
async function render() {
  app.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const B = $('#body');
  if (tab === 'dash') {
    const d = await api('/api/dashboard'), last = d.seller.lastDepositAt;
    $('#live').innerHTML = last ? `<span class="dot"></span>마지막 알림 ${ago(last)}` : '<span class="mute">아직 알림 없음</span>';
    const pend = d.orders.filter((o) => o.status === 'pending'), unm = d.deposits.filter((x) => !x.orderId), crq = d.orders.filter((o) => o.cashReceipt && !o.cashReceipt.issued);
    B.innerHTML = `<div style="display:flex;gap:10px"><div class="card" style="flex:1"><p class="small">매출</p><b style="font-size:19px">${won(d.stats.sales)}</b></div><div class="card" style="flex:1"><p class="small">판매</p><b style="font-size:19px">${d.stats.count}건</b></div></div>
    ${unm.length ? `<div class="card" style="background:#FFF8E6"><b>확인이 필요한 입금 ${unm.length}건</b>${unm.map((x) => `<div class="row"><span>${x.amount ? won(x.amount) : '금액 못 읽음'} · ${esc(x.sender)} · ${time(x.receivedAt)}</span><select data-dep="${x.id}" style="width:auto;height:36px;font-size:13px"><option value="">주문 연결</option>${pend.map((o) => `<option value="${o.id}">${o.no} ${won(o.amount)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}
    ${crq.length ? `<div class="card"><b>현금영수증 요청 ${crq.length}건</b><p class="small">홈택스에서 발행한 뒤 완료를 눌러주세요.</p>${crq.map((o) => `<div class="row"><span>${o.no} · ${won(o.amount)} · ${o.cashReceipt.type === 'expense' ? '지출증빙' : '소득공제'} ${esc(o.cashReceipt.number)}</span><button class="b3 sm" data-cr="${o.id}">완료</button></div>`).join('')}</div>` : ''}
    <div>${d.orders.filter((o) => !o.test).slice(0, 30).map((o) => `<div class="li">${o.product?.images?.[0] ? `<img class="th" src="${o.product.images[0]}" alt="">` : '<div class="th"></div>'}<div class="t">${esc(o.title)} · ${o.no}<small>${won(o.amount)} · ${time(o.createdAt)}${o.code ? ' · 코드 ' + esc(o.code) : ''}</small></div>${badge(o)}${o.status === 'pending' ? `<button class="b3 sm" data-ap="${o.id}">승인</button>` : ''}</div>`).join('') || '<p>아직 주문이 없어요.</p>'}</div>`;
    B.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = async () => { if (confirm('입금을 직접 확인했나요? 결제 완료로 바꿀게요.')) { await api(`/api/orders/${b.dataset.ap}/approve`, { body: {} }); render(); } }));
    B.querySelectorAll('[data-dep]').forEach((s) => (s.onchange = async () => { if (s.value) { await api(`/api/deposits/${s.dataset.dep}/link`, { body: { orderId: s.value } }); render(); } }));
    B.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = async () => { await api(`/api/orders/${b.dataset.cr}/cash-receipt-issued`, { body: {} }); render(); }));
  }
  if (tab === 'prod') {
    const [ps, me] = await Promise.all([api('/api/products'), api('/api/seller')]), url = shopUrl(me.shopId);
    B.innerHTML = `<div class="cols"><div class="c2 sticky"><div class="card" style="align-items:center;text-align:center"><b style="font-size:17px">가게 QR 하나로 모든 굿즈를 팔아요</b><p class="small">손님이 찍으면 굿즈 목록이 열리고, 골라서 한 번에 결제해요.</p><div class="qr" id="sq"></div>
    <div style="display:flex;gap:8px;width:100%"><a class="btn b3" style="flex:1;height:50px" href="qr.html?s=${me.shopId}&mode=show" target="_blank">크게 띄우기</a><a class="btn b3" style="flex:1;height:50px" href="qr.html?s=${me.shopId}&mode=print" target="_blank">A4로 인쇄</a></div>
    <div style="display:flex;gap:8px;width:100%"><button class="b2" id="sqdl">QR 이미지 저장</button><a class="btn b2" href="${url}" target="_blank">손님 화면 보기</a></div></div></div>
    <div class="c1"><h2>굿즈 ${ps.length}개</h2><div>` + ps.map((p) => `<div class="li">${p.images[0] ? `<img class="th" src="${p.images[0]}" alt="">` : '<div class="th"></div>'}<div class="t">${esc(p.name)}<small>${won(p.price)}${p.noDiscount ? ' · 할인 제외' : ''} · 최대 ${p.maxQty}개</small></div><button class="b3 sm" data-del="${p.id}">내리기</button></div>`).join('') + `</div><button id="addp">+ 굿즈 추가</button></div></div>`;
    const c = qrCanvas(url, 220); c.setAttribute('aria-label', '가게 결제 QR'); $('#sq').append(c);
    $('#sqdl').onclick = () => { const a = document.createElement('a'); a.download = `가게QR_${me.name || me.shopId}.png`; a.href = qrCanvas(url, 1000).toDataURL(); a.click(); };
    B.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('이 굿즈를 내릴까요?')) { await api('/api/products/' + b.dataset.del, { method: 'DELETE' }); render(); } }));
    $('#addp').onclick = () => { B.innerHTML = '<h2>새 굿즈 등록</h2>' + productForm(); bindProductForm(() => render()); };
  }
  if (tab === 'code') {
    const cs = await api('/api/codes');
    B.innerHTML = `<div class="cols"><div class="c1"><p class="small">손님이 결제 직전 "할인 및 쿠폰" 칸에 입력하는 코드예요. 지인에게만 말이나 문자로 알려주세요.</p>` + cs.map((c) => `<div class="card"><div class="row"><b style="font-size:18px">${esc(c.code)}</b><label><input type="checkbox" data-c="${esc(c.code)}" ${c.active ? 'checked' : ''} style="width:22px;height:22px"></label></div><div class="row"><span>${esc(c.label)}</span><span>${c.type === 'percent' ? c.value + '%' : won(c.value)} 할인</span></div><div class="row small"><span>사용 ${c.used}회 · ${c.maxUses ? '최대 ' + c.maxUses + '회' : '무제한'}</span></div></div>`).join('') +
      `</div><div class="c2 sticky"><h2>새 할인 코드</h2><label class="f">코드 · 손님이 입력할 글자<input id="cc" placeholder="예: 10"></label><div class="row"><select id="ct" style="width:40%"><option value="percent">비율 %</option><option value="amount">금액 원</option></select><input id="cv" inputmode="numeric" placeholder="10" style="width:58%"></div>
      <label class="f">손님에게 보일 이름<input id="cl" value="지인 할인"></label><label class="f">사용 횟수 · 선택 (0 = 무제한)<input id="cm" inputmode="numeric" value="0"></label><button id="cs">저장</button></div></div>`;
    B.querySelectorAll('[data-c]').forEach((x) => (x.onchange = () => api('/api/codes/' + encodeURIComponent(x.dataset.c), { method: 'PATCH', body: { active: x.checked } })));
    $('#cs').onclick = async () => { try { await api('/api/codes', { body: { code: $('#cc').value, type: $('#ct').value, value: $('#cv').value, label: $('#cl').value, maxUses: $('#cm').value } }); toast('저장했어요'); render(); } catch (e) { toast(e.message); } };
  }
  if (tab === 'set') {
    const s = await api('/api/seller'), hook = `${origin}/api/deposit?s=${s.shopId}&token=${s.webhookToken}`;
    B.innerHTML = `<div class="card"><div class="row"><b>${esc(s.bizName || s.name)}</b><span class="tag ${s.version === 'biz' ? 'to' : 'tg'}">${s.version === 'biz' ? '사업자 있는 버전' : '사업자 없는 버전'}</span></div><p class="small">${esc(s.bank)} ${esc(s.account)} · ${esc(s.holder)}</p></div>
    ${s.version === 'biz' ? `<div class="card"><div class="row"><b>카드·간편결제</b><span class="tag to">PG 연동 예정</span></div><p class="small">PG 심사(수일~2주)가 끝나면 연동합니다. 그동안은 송금으로 판매돼요.</p></div>` : ''}
    <label class="f">입금 알림 웹훅 주소<input readonly value="${esc(hook)}"></label><button class="b2" id="cp">주소 복사</button>
    <label class="f">판매자 키 (다른 기기 로그인용)<input readonly value="${esc(s.adminKey)}"></label>
    <h2>알림 시험</h2><p class="small">입금 알림 문구를 넣으면 실제 알림처럼 처리해요. 발표·연습용이에요.</p><textarea id="st" placeholder="홍길동님이 15,027원을 보냈어요"></textarea><button class="b2" id="sb">시험 알림 보내기</button>`;
    $('#cp').onclick = () => copy(hook); $('#sb').onclick = async () => { const r = await api('/api/simulate-deposit', { body: { text: $('#st').value } }); toast(r.orderId ? '주문과 연결됐어요' : '일치하는 주문이 없어요'); };
  }
}
const badge = (o) => ({ pending: '<span class="tag tb">확인 중</span>', paid: o.code ? `<span class="tag tg">완료 · ${esc(o.code)}</span>` : '<span class="tag tg">완료</span>', expired: '<span class="tag tx">만료</span>' }[o.status]);
const time = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + '초 전' : Math.round(s / 60) + '분 전'; };
boot();
