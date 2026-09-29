// ============================================================
// XWEB ENGINE — Serverless API
// by XRANS OFFICIAL
// Semua endpoint digabung di sini. Env var HANYA di server.
// ============================================================

import crypto from 'crypto';

const FB_URL    = process.env.FB_DB_URL;
const FB_SECRET = process.env.FB_DB_SECRET;
const BQ_BASE   = process.env.BUATQRIS_BASE || 'https://api.buatqris.site';
const BQ_ID     = process.env.BUATQRIS_ID;
const BQ_SECRET = process.env.BUATQRIS_SECRET;
const WH_SECRET = process.env.WEBHOOK_SECRET;

// ---------- Helper: Firebase REST ----------
const fb = (path, opt = {}) =>
  fetch(`${FB_URL}${path}.json?auth=${encodeURIComponent(FB_SECRET)}`, opt).then(r => r.json());
const fbSet   = (p, v) => fb(p, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbPatch = (p, v) => fb(p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbDel   = (p)    => fb(p, { method: 'DELETE' });

// ---------- Helper: BuatQris ----------
const bq = (params) =>
  fetch(BQ_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ account_id: BQ_ID, secret_token: BQ_SECRET, ...params }).toString()
  }).then(r => r.json()).catch(() => null);

// ---------- Helper: response ----------
const ok  = (res, data = {}) => res.status(200).json({ ok: true, ...data });
const err = (res, code, message) => res.status(code).json({ ok: false, message });

// ---------- Helper: validasi ----------
const cleanStr = (s, max) => String(s ?? '').trim().slice(0, max);
const isTok = (s) => /^XWEB-[A-Z0-9]{6}$/i.test(String(s || ''));

// ============================================================
// Endpoint: POST /api/create-order
// Body: { items: [id], name, contact }
// ============================================================
async function createOrder(req, res) {
  const { items, name, contact } = req.body || {};
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Keranjang kosong');
  const nm = cleanStr(name, 80);
  const ct = cleanStr(contact, 120);
  if (nm.length < 2) return err(res, 400, 'Nama tidak valid');
  if (ct.length < 5) return err(res, 400, 'Kontak tidak valid');

  // Ambil produk dari Firebase — server-side authoritative (harga tidak dipercaya dari client)
  const ids = [...new Set(items.map(String))].slice(0, 20);
  const fetched = await Promise.all(ids.map(async id => {
    const p = await fb(`/products/${encodeURIComponent(id)}`);
    return p ? { id, ...p } : null;
  }));
  const valid = fetched.filter(p => p && p.a !== false && p.n && Number(p.p) >= 0);
  if (!valid.length) return err(res, 400, 'Produk tidak tersedia');

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
    ts: now
  };
  await fbSet(`/orders/${token}`, order);

  // Gratis → langsung paid
  if (total === 0) {
    await fbPatch(`/orders/${token}`, { status: 'paid', tot: 0, paid: Date.now() });
    return ok(res, { token, free: true });
  }

  // Berbayar → panggil BuatQris
  const r = await bq({
    action: 'api_create_qris',
    amount: String(total),
    description: `Order ${token}`,
    fee_by: 'buyer',
    app_name: 'XWEB ENGINE',
    app_version: '1.0.0',
    app_url: process.env.APP_URL || ''
  });

  if (!r || !r.success) {
    await fbPatch(`/orders/${token}`, { status: 'failed', note: r?.message || 'QRIS gagal' });
    return err(res, 502, r?.message || 'Gagal membuat QRIS');
  }

  const d = r.data || {};
  await fbPatch(`/orders/${token}`, {
    status: 'pending',
    tot: Number(d.total_amount) || total,        // total_amount termasuk kode unik
    fee: Number(d.admin_fee) || 0,
    qr:  d.qr_url || '',
    pay: d.payment_url || '',
    exp: d.expired_at || null,
    txn: d.transaction_id || null
  });

  // Index txn → token untuk webhook
  if (d.transaction_id) {
    await fbSet(`/txnIndex/${d.transaction_id}`, { token });
  }

  return ok(res, { token });
}

// ============================================================
// Endpoint: POST /api/check-status
// Body: { token }  → kembalikan status order (tanpa _lastCheck)
// ============================================================
async function checkStatus(req, res) {
  const { token } = req.body || {};
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');

  const strip = (x) => { const c = { ...x }; delete c._lastCheck; return c; };

  if (o.status !== 'pending' || !o.txn) {
    return ok(res, { order: strip(o) });
  }

  // Rate limit: 1x/20s
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
// Endpoint: POST /api/view  Body: { id }  → increment views
// ============================================================
async function incView(req, res) {
  const { id } = req.body || {};
  if (!id || String(id).length > 80) return err(res, 400, 'ID invalid');
  // Pakai transaction Firebase via REST: read + write (race ringan, cukup untuk views)
  const p = await fb(`/products/${encodeURIComponent(id)}/v`);
  const next = (Number(p) || 0) + 1;
  await fbSet(`/products/${encodeURIComponent(id)}/v`, next);
  return ok(res, { v: next });
}

// ============================================================
// Endpoint: POST /api/webhook  → callback dari BuatQris
// Header X-BuatQris-Signature: sha256=<hmac>
// ============================================================
async function webhook(req, res) {
  // Body mentah untuk verifikasi HMAC. Vercel default JSON parser — kita ambil raw manual.
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const sig = req.headers['x-buatqris-signature'] || '';
  const calc = 'sha256=' + crypto.createHmac('sha256', WH_SECRET).update(raw).digest('hex');
  if (calc.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(sig))) {
    return res.status(401).json({ ok: false, message: 'Invalid signature' });
  }

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
// Router utama
// ============================================================
export default async function handler(req, res) {
  // CORS — hanya untuk request dari domain sendiri (same-origin) → tolak cross-origin
  const origin = req.headers.origin || '';
  const host   = req.headers.host || '';
  if (origin && !origin.includes(host)) {
    return err(res, 403, 'Forbidden');
  }

  if (!FB_URL || !FB_SECRET) return err(res, 500, 'Server misconfigured');

  // Ambil path setelah /api/
  const url = new URL(req.url, `http://${host}`);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  // Webhook butuh raw body → handle sebelum JSON parse
  if (path === 'webhook') return webhook(req, res);

  // Parse JSON body untuk endpoint lain
  if (req.method === 'POST' && !req.body) {
    const raw = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
  }

  if (req.method !== 'POST') return err(res, 405, 'Method not allowed');

  switch (path) {
    case 'create-order': return createOrder(req, res);
    case 'check-status': return checkStatus(req, res);
    case 'view':         return incView(req, res);
    default:             return err(res, 404, 'Not found');
  }
}