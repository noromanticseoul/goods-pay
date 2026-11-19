// 데모 모드: 서버 대신 이 브라우저 안에서 core.js 로 같은 규칙대로 동작 (데이터는 이 브라우저에만 저장)
window.confirm = () => true;
(function () {
  const KEY = 'gp_demo_shops';
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const store = {
    load: async (id) => all()[id] || null,
    save: async (id, db) => { const a = all(); a[id] = db; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} },
    putImage: async () => {}, imageUrl: (name, dataUrl) => dataUrl,
  };
  window.api = async (path, opt = {}) => {
    if (SHOP && !/[?&]s=/.test(path)) path += (path.includes('?') ? '&' : '?') + 's=' + SHOP;
    let key = ''; try { key = localStorage.getItem('gp_key') || ''; } catch {}
    const r = await GoodsCore.handle(store, { method: opt.method || (opt.body ? 'POST' : 'GET'), url: new URL(path, location.href), headers: { 'x-admin-key': key }, body: opt.body ? JSON.parse(JSON.stringify(opt.body)) : {} });
    if (r.code >= 400) throw new Error((r.body && r.body.error) || '오류가 났어요');
    return JSON.parse(JSON.stringify(r.body));
  };
  // 데모 안내 바: 판매자 화면 이동, 입금 알림 흉내, 초기화
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;z-index:8;background:#191F28;color:#fff;font-size:12.5px;padding:8px max(12px,env(safe-area-inset-left,0px));display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center';
    const isBuyer = /p\.html|r\.html|qr\.html/.test(location.pathname);
    bar.innerHTML = `<span>데모 · 이 브라우저에만 저장돼요 · 실제 사용은 <a href="https://goods-pay-homesick.netlify.app" style="color:#9CC3FF">여기</a></span>${isBuyer ? '<a href="index.html" style="color:#9CC3FF">판매자 화면</a><button id="dm-dep" style="width:auto;height:30px;font-size:12.5px;padding:0 10px;border-radius:8px">판매자 폰에 입금 알림 보내기</button>' : '<a href="1%EC%9D%B8%20%EA%B5%BF%EC%A6%88%20%ED%8C%90%EB%A7%A4%EC%9E%90%EB%A5%BC%20%EC%9C%84%ED%95%9C%20%EA%B5%BF%EC%A6%88%20%EA%B2%B0%EC%A0%9C%EC%8B%9C%EC%8A%A4%ED%85%9C.html" style="color:#9CC3FF">발표 자료</a><a href="1%EC%9D%B8%20%EA%B5%BF%EC%A6%88%20%ED%8C%90%EB%A7%A4%EC%9E%90%EB%A5%BC%20%EC%9C%84%ED%95%9C%20%EA%B5%BF%EC%A6%88%20%EA%B2%B0%EC%A0%9C%EC%8B%9C%EC%8A%A4%ED%85%9C.pdf" download style="color:#9CC3FF">PDF 받기</a>'}<button id="dm-reset" style="width:auto;height:30px;font-size:12.5px;padding:0 10px;border-radius:8px;background:#333D4B">처음부터</button>`;
    document.body.prepend(bar);
    const dep = document.getElementById('dm-dep');
    if (dep) dep.onclick = async () => { const db = all()[SHOP] || { orders: [] }; const o = db.orders.find((x) => x.status === 'pending'); if (!o) return toast('먼저 결제 방법을 눌러 주문을 만들어주세요'); await window.api('/api/simulate-deposit', { body: { text: `[토스] 김민지님이 ${o.amount.toLocaleString('ko-KR')}원을 보냈어요` } }); toast('입금 알림을 보냈어요'); };
    document.getElementById('dm-reset').onclick = () => { try { localStorage.removeItem(KEY); localStorage.removeItem('gp_key'); localStorage.removeItem('gp_shop'); } catch {} location.href = 'index.html'; };
  });
})();
