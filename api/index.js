// ============================================================
// XWEB ENGINE - Serverless API (Hardened)
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

// ---------- Rate limit storage (in-memory, per instance) ----------
const RL = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of RL) if (v.reset < now) RL.delete(k);
}, 60000);

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let e = RL.get(key);
  if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; RL.set(key, e); }
  e.count++;
  return {
    ok: e.count <= max,
    remaining: Math.max(0, max - e.count),
    retry_after: Math.ceil((e.reset - now) / 1000)
  };
}

// ---------- Response ----------
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

// ---------- Validation ----------
const cleanStr = (s, max) => String(s ?? '').trim().slice(0, max);
const isTok = (s) => /^XWEB-[A-Z0-9]{6}$/i.test(String(s || ''));
const isIdSafe = (s) => /^[a-zA-Z0-9_-]{1,80}$/.test(String(s || ''));
const isAdmin = (req) => {
  const t = req.headers['x-admin-token'] || req.body?.admin_token || '';
  if (!ADMIN_TOKEN || !t || t.length !== ADMIN_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN)); }
  catch { return false; }
};

// ---------- Origin & Method checks ----------
function checkOrigin(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';

  // Tanpa origin/referer: hanya izinkan kalau bukan browser (server-to-server)
  // Untuk endpoint web, wajib ada origin/referer dari domain yang sama
  if (!origin && !referer) return { ok: false, reason: 'no-origin' };

  const check = (u) => {
    if (!u) return false;
    try {
      const h = new URL(u).host;
      // Harus PERSIS sama dengan host, bukan includes
      return h === host;
    } catch { return false; }
  };

  if (origin && !check(origin)) return { ok: false, reason: 'bad-origin' };
  if (referer && !check(referer)) return { ok: false, reason: 'bad-referer' };
  if (APP_URL) {
    const appHost = new URL(APP_URL).host;
    if (host !== appHost && origin && !origin.includes(appHost)) {
      // fallback kalau host Vercel beda dengan APP_URL
    }
  }
  return { ok: true };
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// ---------- Firebase REST (dengan timeout) ----------
async function fbFetch(url, opt = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opt, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}
const fb = (path, opt = {}) =>
  fbFetch(`${FB_URL}${path}.json?auth=${encodeURIComponent(FB_SECRET)}`, opt).then(r => r.json());
const fbSet   = (p, v) => fb(p, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbPatch = (p, v) => fb(p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbDel   = (p)    => fb(p, { method: 'DELETE' });

// ---------- BuatQris (dengan timeout) ----------
async function bq(params) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(BQ_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ account_id: BQ_ID, secret_token: BQ_SECRET, ...params }).toString(),
      signal: ctrl.signal
    });
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

// ============================================================
// POST /api/create-order
// Rate limit: 5 order / menit per IP, 20 order / 10 menit per IP
// ============================================================
async function createOrder(req, res) {
  const ip = getClientIp(req);
  const r1 = rateLimit(`order:${ip}`, 5, 60_000);
  if (!r1.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r1.retry_after} detik.`);
  const r2 = rateLimit(`order10:${ip}`, 20, 600_000);
  if (!r2.ok) return err(res, 429, 'Batas order tercapai. Coba lagi nanti.');

  const body = getBody(req);
  const { items, name, contact } = body;
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Keranjang kosong');
  if (items.length > 20) return err(res, 400, 'Terlalu banyak item');

  const nm = cleanStr(name, 80);
  const ct = cleanStr(contact, 120);
  if (nm.length < 2) return err(res, 400, 'Nama tidak valid');
  if (ct.length < 5) return err(res, 400, 'Kontak tidak valid');
  if (nm.length > 80 || ct.length > 120) return err(res, 400, 'Input terlalu panjang');

  // Validasi setiap ID produk
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
    ip: ip.slice(0, 40)  // untuk audit
  };
  await fbSet(`/orders/${token}`, order);

  if (total === 0) {
    await fbPatch(`/orders/${token}`, { status: 'paid', tot: 0, paid: Date.now() });
    return ok(res, { token, free: true });
  }

  const r = await bq({
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
// Rate limit: 30 / 5 menit per IP, dan 1 / 20s per (IP + token)
// ============================================================
async function checkStatus(req, res) {
  const ip = getClientIp(req);
  const r1 = rateLimit(`chk:${ip}`, 30, 300_000);
  if (!r1.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r1.retry_after} detik.`);

  const body = getBody(req);
  const { token } = body;
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  // Rate limit per token juga — cegah brute-force token
  const r2 = rateLimit(`chkT:${ip}:${token}`, 5, 60_000);
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

  const r = await bq({
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
// Rate limit: 30 / 5 menit per IP
// ============================================================
async function getOrder(req, res) {
  const ip = getClientIp(req);
  const r = rateLimit(`getOrd:${ip}`, 30, 300_000);
  if (!r.ok) return err(res, 429, `Terlalu banyak. Coba lagi ${r.retry_after} detik.`);

  const body = getBody(req);
  const { token } = body;
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  // Rate limit per token untuk cegah brute-force
  const r2 = rateLimit(`getOrdT:${ip}:${token}`, 10, 60_000);
  if (!r2.ok) return err(res, 429, `Coba lagi ${r2.retry_after} detik.`);

  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');
  delete o._lastCheck;
  delete o.ip;
  if (o.status !== 'paid') delete o.reply;
  return ok(res, { order: o });
}

// ============================================================
// POST /api/view
// Rate limit: 20 / menit per IP, 1x per (IP + produk) / 30 menit
// ============================================================
async function incView(req, res) {
  const ip = getClientIp(req);
  const r1 = rateLimit(`view:${ip}`, 20, 60_000);
  if (!r1.ok) return err(res, 429, 'Terlalu banyak.');

  const body = getBody(req);
  const { id } = body;
  if (!id || !isIdSafe(id)) return err(res, 400, 'ID invalid');

  // Dedup: 1 IP hanya boleh naikkan views produk yang sama 1x / 30 menit
  const r2 = rateLimit(`viewD:${ip}:${id}`, 1, 1_800_000);
  if (!r2.ok) return ok(res, { v: null, dedup: true });

  const cur = await fb(`/products/${encodeURIComponent(id)}/v`).catch(() => null);
  const next = (Number(cur) || 0) + 1;
  await fbSet(`/products/${encodeURIComponent(id)}/v`, next).catch(() => {});
  return ok(res, { v: next });
}

// ============================================================
// POST /api/admin-orders
// ============================================================
async function adminOrders(req, res) {
  if (!isAdmin(req)) return err(res, 401, 'Admin token salah');
  const ip = getClientIp(req);
  const r = rateLimit(`admOrd:${ip}`, 60, 60_000);
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
  const r = rateLimit(`admAct:${ip}`, 60, 60_000);
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
      if (total > 100_000) { reject(new Error('payload too large')); req.destroy(); return; }
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
  // Security headers dasar untuk semua response
  Object.entries(SEC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (!FB_URL || !FB_SECRET) return err(res, 500, 'Server misconfigured');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  // Webhook: handle sebelum apapun, cek method dulu
  if (path === 'webhook') {
    if (req.method !== 'POST') return err(res, 405, 'Method not allowed');
    return webhook(req, res);
  }

  // Semua endpoint hanya POST
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');

  // Origin/referer check (kecuali admin yang pakai token)
  const isAdminPath = path === 'admin-orders' || path === 'admin-action';
  if (!isAdminPath) {
    const oc = checkOrigin(req);
    if (!oc.ok) return err(res, 403, 'Forbidden');
  }

  // Content-Type harus JSON untuk endpoint non-webhook
  const ctype = req.headers['content-type'] || '';
  if (!ctype.toLowerCase().includes('application/json')) {
    return err(res, 415, 'Content-Type harus application/json');
  }

  // Parse body
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
    case 'admin-orders': return adminOrders(req, res);
    case 'admin-action': return adminAction(req, res);
    default:             return err(res, 404, 'Not found');
  }
}