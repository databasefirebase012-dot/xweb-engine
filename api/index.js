// ============================================================
// XWEB ENGINE - Serverless API (Hardened v3)
// by XRANS OFFICIAL
// ============================================================

import crypto from 'crypto';

const FB_URL    = process.env.FB_DB_URL;
const FB_SECRET = process.env.FB_DB_SECRET;
const BQ_BASE   = process.env.BUATQRIS_BASE || 'https://api.buatqris.site';
const BQ_ID     = process.env.BUATQRIS_ID;
const BQ_SECRET = process.env.BUATQRIS_SECRET;
const WH_SECRET = process.env.WEBHOOK_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const APP_URL   = process.env.APP_URL || '';

// ============================================================
// Security headers
// ============================================================
const SEC_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store, max-age=0',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

function ok(res, data = {}) {
  Object.entries(SEC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json({ ok: true, ...data });
}
function err(res, code, message) {
  Object.entries(SEC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(code).json({ ok: false, message });
}

// ============================================================
// Validation
// ============================================================
const cleanStr = (s, max) => String(s ?? '').trim().slice(0, max);
const isTok = (s) => /^XWEB-[A-Z0-9]{6}$/i.test(String(s || ''));
const isIdSafe = (s) => /^[a-zA-Z0-9_-]{1,80}$/.test(String(s || ''));
const isAdmin = (req) => {
  const t = req.headers['x-admin-token'] || req.body?.admin_token || '';
  if (!ADMIN_TOKEN || !t || t.length !== ADMIN_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN)); }
  catch { return false; }
};

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}
function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// ============================================================
// Firebase REST
// ============================================================
async function fbFetch(url, opt = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opt, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
const fbAuth = `?auth=${encodeURIComponent(FB_SECRET)}`;
const fb = (path, opt = {}) => fbFetch(`${FB_URL}${path}.json${fbAuth}`, opt).then(r => r.json());
const fbSet   = (p, v) => fb(p, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbPatch = (p, v) => fb(p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbDel   = (p)    => fb(p, { method: 'DELETE' });

// ============================================================
// Rate Limit — DUA LAPIS, TIDAK BISA DILEWATI
// Layer 1: in-memory (SELALU jalan, instan)
// Layer 2: Firebase (cross-instance, kalau bisa)
// Kalau salah satu bilang OVER → BLOCK
// ============================================================
const RL_MEM = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of RL_MEM) if (v.r < now) RL_MEM.delete(k);
}, 60000);

function checkMem(key, max, windowMs) {
  const now = Date.now();
  let e = RL_MEM.get(key);
  if (!e || e.r < now) { e = { c: 0, r: now + windowMs }; RL_MEM.set(key, e); }
  e.c++;
  return { ok: e.c <= max, retry_after: Math.max(1, Math.ceil((e.r - now) / 1000)), count: e.c };
}

async function rateLimit(bucket, key, max, windowMs) {
  // Layer 1 — IN-MEMORY (SELALU CEK DULU)
  const mem = checkMem(`${bucket}:${key}`, max, windowMs);
  if (!mem.ok) return { ok: false, retry_after: mem.retry_after, layer: 'mem' };

  // Layer 2 — FIREBASE (cross-instance)
  const now = Date.now();
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
  const path = `/_rl/${bucket}/${hash}`;

  try {
    const cur = await fb(path);
    if (cur && typeof cur === 'object' && cur.r > now) {
      if (cur.c >= max) {
        return { ok: false, retry_after: Math.ceil((cur.r - now) / 1000), layer: 'fb' };
      }
      await fbPatch(path, { c: (cur.c || 0) + 1 });
      return { ok: true };
    }
    await fbSet(path, { c: 1, r: now + windowMs });
    return { ok: true };
  } catch {
    // Firebase gagal → tetap lanjut (in-memory sudah cek). Jangan fail-open total.
    return { ok: true, warn: 'fb-unreachable' };
  }
}

// ============================================================
// Origin check
// ============================================================
function checkOrigin(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';
  if (!origin && !referer) return { ok: false };
  const check = (u) => {
    if (!u) return false;
    try { return new URL(u).host === host; } catch { return false; }
  };
  if (origin && !check(origin)) return { ok: false };
  if (referer && !check(referer)) return { ok: false };
  return { ok: true };
}

// ============================================================
// BuatQris
// ============================================================
async function bqCall(params) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const resp = await fetch(BQ_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ account_id: BQ_ID, secret_token: BQ_SECRET, ...params }).toString(),
      signal: ctrl.signal
    });
    return await resp.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

// ============================================================
// POST /api/create-order
// ============================================================
async function createOrder(req, res) {
  const ip = getClientIp(req);
  const r1 = await rateLimit('order_m', ip, 5, 60_000);
  if (!r1.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r1.retry_after} detik.`);
  const r2 = await rateLimit('order_10m', ip, 20, 600_000);
  if (!r2.ok) return err(res, 429, 'Batas order tercapai. Coba lagi nanti.');

  const body = getBody(req);
  const { items, name, contact } = body;
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Keranjang kosong');
  if (items.length > 20) return err(res, 400, 'Terlalu banyak item');

  const nm = cleanStr(name, 80);
  const ct = cleanStr(contact, 120);
  if (nm.length < 2) return err(res, 400, 'Nama tidak valid');
  if (ct.length < 5) return err(res, 400, 'Kontak tidak valid');

  const ids = [...new Set(items.map(String))];
  for (const id of ids) {
    if (!isIdSafe(id)) return err(res, 400, 'ID produk tidak valid');
  }

  const fetched = await Promise.all(ids.map(async id => {
    const p = await fb(`/products/${encodeURIComponent(id)}`).catch(() => null);
    return p ? { id, ...p } : null;
  }));
  const valid = fetched.filter(p => p && p.a !== false && p.n && Number(p.p) >= 0);
  if (!valid.length) return err(res, 400, 'Produk tidak tersedia');
  if (valid.length !== ids.length) return err(res, 400, 'Beberapa produk tidak valid');

  const total = valid.reduce((s, p) => s + Number(p.p || 0), 0);
  const token = 'XWEB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const now = Date.now();

  const order = {
    code: token,
    status: 'creating',
    amt: total,
    tot: total,
    fee: 0,
    nm,
    ct,
    items: valid.map(p => ({ n: p.n, p: Number(p.p || 0), i: p.id })),
    ts: now,
    ip: ip.slice(0, 40)
  };
  await fbSet(`/orders/${token}`, order);

  if (total === 0) {
    await fbPatch(`/orders/${token}`, { status: 'paid', tot: 0, paid: Date.now() });
    return ok(res, { token, free: true });
  }

  const r = await bqCall({
    action: 'api_create_qris',
    amount: String(total),
    description: `Order ${token}`,
    fee_by: 'buyer',
    app_name: 'XWEB ENGINE',
    app_version: '1.0.0',
    app_url: APP_URL
  });

  if (!r || !r.success) {
    await fbPatch(`/orders/${token}`, { status: 'failed', note: r?.message || 'QRIS gagal' });
    return err(res, 502, r?.message || 'Gagal membuat QRIS');
  }

  const d = r.data || {};
  await fbPatch(`/orders/${token}`, {
    status: 'pending',
    tot: Number(d.total_amount) || total,
    fee: Number(d.admin_fee) || 0,
    qr:  d.qr_url || '',
    exp: d.expired_at || null,
    txn: d.transaction_id || null
  });

  if (d.transaction_id) {
    await fbSet(`/txnIndex/${d.transaction_id}`, { token });
  }

  return ok(res, { token });
}

// ============================================================
// POST /api/check-status
// ============================================================
async function checkStatus(req, res) {
  const ip = getClientIp(req);
  const r1 = await rateLimit('chk_5m', ip, 30, 300_000);
  if (!r1.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r1.retry_after} detik.`);

  const body = getBody(req);
  const { token } = body;
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  const r2 = await rateLimit('chkT_m', `${ip}:${token}`, 5, 60_000);
  if (!r2.ok) return err(res, 429, `Coba lagi ${r2.retry_after} detik.`);

  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');

  const strip = (x) => { const c = { ...x }; delete c._lastCheck; delete c.ip; return c; };

  if (o.status !== 'pending' || !o.txn) {
    return ok(res, { order: strip(o) });
  }

  const now = Date.now();
  if (o._lastCheck && now - o._lastCheck < 20000) {
    return ok(res, {
      order: strip(o),
      retry_after: Math.ceil((20000 - (now - o._lastCheck)) / 1000)
    });
  }
  await fbSet(`/orders/${token}/_lastCheck`, now);

  const r = await bqCall({
    action: 'api_check_status',
    transaction_id: String(o.txn)
  });

  if (r?.error === 'rate_limited') {
    return ok(res, { order: strip(o), retry_after: r.retry_after || 20 });
  }

  if (r?.success && r.data?.status) {
    const map = { success: 'paid', expired: 'expired', failed: 'failed' };
    const ns = map[r.data.status] || o.status;
    if (ns !== o.status) {
      const patch = { status: ns };
      if (ns === 'paid') patch.paid = Date.now();
      await fbPatch(`/orders/${token}`, patch);
      o.status = ns;
      if (patch.paid) o.paid = patch.paid;
    }
  }

  return ok(res, { order: strip(o) });
}

// ============================================================
// POST /api/order
// ============================================================
async function getOrder(req, res) {
  const ip = getClientIp(req);
  const r = await rateLimit('getOrd_5m', ip, 30, 300_000);
  if (!r.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r.retry_after} detik.`);

  const body = getBody(req);
  const { token } = body;
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  const r2 = await rateLimit('getOrdT_m', `${ip}:${token}`, 10, 60_000);
  if (!r2.ok) return err(res, 429, `Coba lagi ${r2.retry_after} detik.`);

  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');
  delete o._lastCheck;
  delete o.ip;
  if (o.status !== 'paid') delete o.reply;
  return ok(res, { order: o });
}

// ============================================================
// POST /api/view — PENTING
// - Cek produk ADA dulu
// - Layer in-memory + Firebase
// - Dedup per IP per produk per 24 jam
// ============================================================
async function incView(req, res) {
  const ip = getClientIp(req);

  // Rate limit global per IP — WAJIB JALAN
  const r1 = await rateLimit('view_m', ip, 20, 60_000);
  if (!r1.ok) return err(res, 429, `Rate limit views. Coba lagi ${r1.retry_after} detik.`);

  const body = getBody(req);
  const { id } = body;
  if (!id || !isIdSafe(id)) return err(res, 400, 'ID invalid');

  // Cek produk ada — JANGAN bikin folder baru
  const prod = await fb(`/products/${encodeURIComponent(id)}`).catch(() => null);
  if (!prod || typeof prod !== 'object' || !prod.n) {
    return ok(res, { v: null, skip: true });
  }

  // Dedup per IP per produk per 24 jam
  const r2 = await rateLimit('viewD_24h', `${ip}:${id}`, 1, 86_400_000);
  if (!r2.ok) return ok(res, { v: prod.v || 0, dedup: true });

  // Increment views
  const cur = Number(prod.v) || 0;
  const next = cur + 1;
  await fbPatch(`/products/${encodeURIComponent(id)}`, { v: next }).catch(() => {});
  return ok(res, { v: next });
}

// ============================================================
// POST /api/debug-rl — cek rate limit bekerja
// ============================================================
async function debugRl(req, res) {
  const ip = getClientIp(req);
  const result = {
    ip_prefix: ip.slice(0, 10) + '...',
    fb_url_present: !!FB_URL,
    fb_secret_len: FB_SECRET ? FB_SECRET.length : 0,
    rl_mem_size: RL_MEM.size
  };

  // Test tulis ke Firebase
  try {
    await fbSet('/_rl/_debug', { ts: Date.now(), ip: ip.slice(0, 20) });
    result.fb_write = 'ok';
  } catch (e) {
    result.fb_write = 'fail';
    result.fb_write_err = String(e.message || e).slice(0, 80);
  }

  // Test rate limit layer mem — limit 3 / 60 detik untuk test cepat
  const r = await rateLimit('debug', ip, 3, 60_000);
  result.rl_result = r;

  return ok(res, result);
}

// ============================================================
// POST /api/admin-orders
// ============================================================
async function adminOrders(req, res) {
  if (!isAdmin(req)) return err(res, 401, 'Admin token salah');
  const ip = getClientIp(req);
  const r = await rateLimit('admOrd_m', ip, 60, 60_000);
  if (!r.ok) return err(res, 429, 'Terlalu banyak.');

  const o = await fb('/orders') || {};
  const list = Object.entries(o).map(([tok, v]) => ({ tok, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return ok(res, { orders: list, server_ts: Date.now() });
}

// ============================================================
// POST /api/admin-action
// ============================================================
async function adminAction(req, res) {
  if (!isAdmin(req)) return err(res, 401, 'Admin token salah');
  const ip = getClientIp(req);
  const r = await rateLimit('admAct_m', ip, 60, 60_000);
  if (!r.ok) return err(res, 429, 'Terlalu banyak.');

  const body = getBody(req);
  const { token, action } = body;
  if (!isTok(token)) return err(res, 400, 'Token invalid');

  const cur = await fb(`/orders/${token}`);
  if (!cur) return err(res, 404, 'Order tidak ditemukan');

  if (action === 'mark_paid') {
    await fbPatch(`/orders/${token}`, { status: 'paid', paid: Date.now() });
    return ok(res);
  }

  if (action === 'delete') {
    await fbDel(`/orders/${token}`);
    if (cur.txn) await fbDel(`/txnIndex/${cur.txn}`);
    return ok(res);
  }

  if (action === 'add_delivery') {
    const n = cleanStr(body.name, 120);
    const l = cleanStr(body.link, 500);
    if (!n) return err(res, 400, 'Nama delivery wajib');
    const dl = Array.isArray(cur.dl) ? [...cur.dl, { n, l }] : [{ n, l }];
    await fbSet(`/orders/${token}/dl`, dl);
    return ok(res);
  }

  if (action === 'remove_delivery') {
    const idx = Number(body.index);
    const dl = Array.isArray(cur.dl) ? [...cur.dl] : [];
    if (idx >= 0 && idx < dl.length) dl.splice(idx, 1);
    await fbSet(`/orders/${token}/dl`, dl);
    return ok(res);
  }

  if (action === 'reply') {
    const m = String(body.message ?? '').slice(0, 20000);
    if (!m.trim()) return err(res, 400, 'Pesan kosong');
    await fbSet(`/orders/${token}/reply`, { m, ts: Date.now() });
    return ok(res);
  }

  return err(res, 400, 'Action tidak dikenal');
}

// ============================================================
// POST /api/webhook
// ============================================================
async function webhook(req, res) {
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 100_000) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  }).catch(() => null);

  if (!raw) return res.status(413).end();

  const sig = req.headers['x-buatqris-signature'] || '';
  const calc = 'sha256=' + crypto.createHmac('sha256', WH_SECRET).update(raw).digest('hex');
  if (calc.length !== sig.length) return res.status(401).json({ ok: false });
  try {
    if (!crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(sig))) {
      return res.status(401).json({ ok: false, message: 'Invalid signature' });
    }
  } catch { return res.status(401).json({ ok: false }); }

  let body;
  try { body = JSON.parse(raw.toString()); } catch { return res.status(400).end(); }

  const { event, transaction_id } = body;
  if (!transaction_id) return res.status(200).json({ ok: true });

  const idx = await fb(`/txnIndex/${transaction_id}`);
  if (!idx || !idx.token) return res.status(200).json({ ok: true, note: 'unknown txn' });

  const token = idx.token;
  const cur = await fb(`/orders/${token}`);
  if (!cur) return res.status(200).json({ ok: true });
  if (cur.status === 'paid') return res.status(200).json({ ok: true, note: 'already paid' });

  if (event === 'payment.success' || body.status === 'success') {
    await fbPatch(`/orders/${token}`, { status: 'paid', paid: Date.now() });
  } else if (event === 'payment.expired') {
    await fbPatch(`/orders/${token}`, { status: 'expired' });
  } else if (event === 'payment.failed') {
    await fbPatch(`/orders/${token}`, { status: 'failed' });
  }

  return res.status(200).json({ ok: true });
}

// ============================================================
// Router
// ============================================================
export default async function handler(req, res) {
  Object.entries(SEC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (!FB_URL || !FB_SECRET) return err(res, 500, 'Server misconfigured');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  if (path === 'webhook') {
    if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
    return webhook(req, res);
  }

  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');

  const isAdminPath = path === 'admin-orders' || path === 'admin-action';
  if (!isAdminPath) {
    if (!checkOrigin(req).ok) return err(res, 403, 'Forbidden');
  }

  const ctype = req.headers['content-type'] || '';
  if (!ctype.toLowerCase().includes('application/json')) {
    return err(res, 415, 'Content-Type harus application/json');
  }

  if (!req.body) {
    const raw = await new Promise((resolve) => {
      const chunks = [];
      let total = 0;
      req.on('data', c => {
        total += c.length;
        if (total > 200_000) { req.destroy(); resolve(''); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
  }

  switch (path) {
    case 'create-order': return createOrder(req, res);
    case 'check-status': return checkStatus(req, res);
    case 'order':        return getOrder(req, res);
    case 'view':         return incView(req, res);
    case 'debug-rl':     return debugRl(req, res);
    case 'admin-orders': return adminOrders(req, res);
    case 'admin-action': return adminAction(req, res);
    default:             return err(res, 404, 'Not found');
  }
}