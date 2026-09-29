// ============================================================
// XWEB ENGINE - Serverless API
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

// ---------- Firebase REST ----------
const fb = (path, opt = {}) =>
  fetch(`${FB_URL}${path}.json?auth=${encodeURIComponent(FB_SECRET)}`, opt).then(r => r.json());
const fbSet   = (p, v) => fb(p, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbPatch = (p, v) => fb(p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
const fbDel   = (p)    => fb(p, { method: 'DELETE' });

// ---------- BuatQris ----------
const bq = (params) =>
  fetch(BQ_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ account_id: BQ_ID, secret_token: BQ_SECRET, ...params }).toString()
  }).then(r => r.json()).catch(() => null);

// ---------- Response ----------
const ok  = (res, data = {}) => res.status(200).json({ ok: true, ...data });
const err = (res, code, message) => res.status(code).json({ ok: false, message });

// ---------- Validation ----------
const cleanStr = (s, max) => String(s ?? '').trim().slice(0, max);
const isTok = (s) => /^XWEB-[A-Z0-9]{6}$/i.test(String(s || ''));
const isAdmin = (req) => {
  const t = req.headers['x-admin-token'] || req.body?.admin_token || '';
  return ADMIN_TOKEN && t && t.length === ADMIN_TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN));
};

// ============================================================
// POST /api/create-order
// ============================================================
async function createOrder(req, res) {
  const { items, name, contact } = req.body || {};
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Keranjang kosong');
  const nm = cleanStr(name, 80);
  const ct = cleanStr(contact, 120);
  if (nm.length < 2) return err(res, 400, 'Nama tidak valid');
  if (ct.length < 5) return err(res, 400, 'Kontak tidak valid');

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
    app_url: process.env.APP_URL || ''
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
    pay: d.payment_url || '',
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
  const { token } = req.body || {};
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');

  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');

  const strip = (x) => { const c = { ...x }; delete c._lastCheck; return c; };

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
// POST /api/order - baca order by token (publik, sengaja dibatasi)
// ============================================================
async function getOrder(req, res) {
  const { token } = req.body || {};
  if (!isTok(token)) return err(res, 400, 'Token tidak valid');
  const o = await fb(`/orders/${token}`);
  if (!o) return err(res, 404, 'Order tidak ditemukan');
  delete o._lastCheck;
  // Balasan admin hanya terlihat kalau status sudah paid
  if (o.status !== 'paid') delete o.reply;
  return ok(res, { order: o });
}

// ============================================================
// POST /api/view
// ============================================================
async function incView(req, res) {
  const { id } = req.body || {};
  if (!id || String(id).length > 80) return err(res, 400, 'ID invalid');
  const p = await fb(`/products/${encodeURIComponent(id)}/v`);
  const next = (Number(p) || 0) + 1;
  await fbSet(`/products/${encodeURIComponent(id)}/v`, next);
  return ok(res, { v: next });
}

// ============================================================
// POST /api/admin-orders - list order (butuh ADMIN_TOKEN)
// ============================================================
async function adminOrders(req, res) {
  if (!isAdmin(req)) return err(res, 401, 'Admin token salah');
  const o = await fb('/orders') || {};
  const list = Object.entries(o).map(([tok, v]) => ({ tok, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return ok(res, { orders: list, server_ts: Date.now() });
}

// ============================================================
// POST /api/admin-action - edit order (butuh ADMIN_TOKEN)
// body: { token, action, ...payload }
// action: mark_paid | delete | add_delivery | remove_delivery | reply
// ============================================================
async function adminAction(req, res) {
  if (!isAdmin(req)) return err(res, 401, 'Admin token salah');
  const { token, action } = req.body || {};
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
    const { name, link } = req.body || {};
    const n = cleanStr(name, 120);
    const l = cleanStr(link, 500);
    if (!n) return err(res, 400, 'Nama delivery wajib');
    const dl = Array.isArray(cur.dl) ? [...cur.dl, { n, l }] : [{ n, l }];
    await fbSet(`/orders/${token}/dl`, dl);
    return ok(res);
  }

  if (action === 'remove_delivery') {
    const { index } = req.body || {};
    const dl = Array.isArray(cur.dl) ? [...cur.dl] : [];
    if (index >= 0 && index < dl.length) dl.splice(index, 1);
    await fbSet(`/orders/${token}/dl`, dl);
    return ok(res);
  }

  if (action === 'reply') {
    const { message } = req.body || {};
    const m = String(message ?? '').slice(0, 20000); // batas aman 20.000 karakter
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
// Router
// ============================================================
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const host   = req.headers.host || '';
  if (origin && !origin.includes(host)) {
    return err(res, 403, 'Forbidden');
  }

  if (!FB_URL || !FB_SECRET) return err(res, 500, 'Server misconfigured');

  const url = new URL(req.url, `http://${host}`);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  if (path === 'webhook') return webhook(req, res);

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
    case 'order':        return getOrder(req, res);
    case 'view':         return incView(req, res);
    case 'admin-orders': return adminOrders(req, res);
    case 'admin-action': return adminAction(req, res);
    default:             return err(res, 404, 'Not found');
  }
}