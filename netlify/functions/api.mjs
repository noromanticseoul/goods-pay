// Netlify 함수: /api/* 와 /uploads/* 를 처리. 데이터는 Netlify Blobs 에 가게별로 저장.
import { getStore } from '@netlify/blobs';
import core from '../../core.js';

const blobs = () => getStore({ name: 'goodspay', consistency: 'strong' });
const IMG = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export default async (req) => {
  const url = new URL(req.url), st = blobs();
  if (url.pathname.startsWith('/uploads/')) {
    const name = url.pathname.slice(9);
    const b = /^[a-f0-9]+\.(jpg|png|webp)$/.test(name) ? await st.get('img/' + name, { type: 'arrayBuffer' }) : null;
    if (!b) return new Response('Not found', { status: 404 });
    return new Response(b, { headers: { 'content-type': IMG[name.split('.').pop()], 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  let body = {};
  if (req.method !== 'GET') { const t = await req.text(); try { body = JSON.parse(t || '{}'); } catch { body = { text: t }; } }
  const store = {
    load: (id) => st.get('shop/' + id, { type: 'json' }),
    save: (id, db) => st.setJSON('shop/' + id, db),
    putImage: (name, b64) => st.set('img/' + name, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))),
  };
  try {
    const r = await core.handle(store, { method: req.method, url, headers: Object.fromEntries(req.headers), body });
    return new Response(JSON.stringify(r.body), { status: r.code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: '서버 오류' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
};

export const config = { path: ['/api/*', '/uploads/*'] };
