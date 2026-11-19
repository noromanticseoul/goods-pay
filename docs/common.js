const $ = (s, r = document) => r.querySelector(s);
const won = (n) => (n || 0).toLocaleString('ko-KR') + '원';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 가게 id: 주소의 ?s= 가 우선, 없으면 판매자 폰에 저장된 값
const SHOP = new URLSearchParams(location.search).get('s') || (() => { try { return localStorage.getItem('gp_shop') || ''; } catch { return ''; } })();
const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
const shopUrl = (s) => `${BASE}p.html?s=${s || SHOP}`;
async function api(path, opt = {}) {
  if (SHOP && !/[?&]s=/.test(path)) path += (path.includes('?') ? '&' : '?') + 's=' + SHOP;
  const r = await fetch(path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', 'x-admin-key': localStorage.getItem('gp_key') || '' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '오류가 났어요');
  return j;
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 1800); }
// QR을 캔버스로 그리기 (vendor/qrcode.js)
function qrCanvas(text, size) { const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), k = Math.max(1, Math.floor(size / (n + 8))), c = document.createElement('canvas'); c.width = c.height = k * (n + 8); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#191F28'; for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + 4) * k, (r + 4) * k, k, k); return c; }
async function copy(t, msg) { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); } toast(msg || '복사했어요'); }
// 사진을 1024px JPEG로 줄여서 dataURL로
function shrink(file) {
  return new Promise((ok, no) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1024 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => { URL.revokeObjectURL(u); no(new Error('사진을 열 수 없어요')); };
    img.src = u;
  });
}
