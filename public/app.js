// ============================================================
// XWEB ENGINE - Frontend
// by XRANS OFFICIAL
// ============================================================

const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const S = n => $('#s-' + n);
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const vib = n => navigator.vibrate && navigator.vibrate(n);
const fv = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const FB = 'https://message-web1-default-rtdb.asia-southeast1.firebasedatabase.app';

const IC = {
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 003-3V8M6 16V8"/>',
  bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  img:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  sync:'<path d="M20 8a8 8 0 00-14-2M4 4v4h4M4 16a8 8 0 0014 2M20 20v-4h-4"/>',
  form:'<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  chart:'<path d="M5 20V11M12 20V4M19 20v-6"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  shield:'<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  box:'<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  code:'<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  cloud:'<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117 18H7z"/>',
  db:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>'
};

const sv = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k] || IC.box}</svg>`;
const isUrl = s => /^https?:\/\//i.test(String(s || '').trim());
const renderIcon = (icon, size = 34) => {
  if (!icon) return sv('box');
  if (isUrl(icon)) return `<img src="${esc(icon)}" style="width:${size}px;height:${size}px;object-fit:contain" alt="" loading="lazy">`;
  return sv(icon);
};
const eye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>';
const bagI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l-1.4 12H6.4L5 7z"/><path d="M9 7a3 3 0 016 0"/></svg>';
const COL = ['#C9D8FF', '#F6E3A1', '#BFE3CF', '#F5C9B0', '#E3D3EE', '#CFE6F0'];

let P = [], ST = {}, ready = false, cat = 'all', qs = '';
let cart = load('xw_cart', []);
let myOrders = load('xw_orders', []);
const OD = {};
const TABS = ['home', 'mod', 'orders', 'cart'];
let cur = null, stack = [], curDetail = null, curTok = null;

const byId = id => P.find(p => p.id === id);
const pcol = p => p.col || COL[0];
const saveCart = () => save('xw_cart', cart);
const saveOrders = () => save('xw_orders', myOrders);

const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .08 });

function enter(s) {
  $$('.rv', s).forEach((el, i) => {
    io.unobserve(el); el.classList.remove('in');
    el.style.transitionDelay = (i % 4) * .06 + 's';
    io.observe(el);
  });
}
function live(box) {
  const s = box.closest('.scr');
  if (s && s.classList.contains('on')) $$('.rv', box).forEach(el => el.classList.add('in'));
}
function tab(n) {
  if (stack.length) popAll();
  if (n === cur) { S(n).scrollTo({ top: 0, behavior: 'smooth' }); return }
  const i = TABS.indexOf(n);
  TABS.forEach((t, k) => {
    const el = S(t);
    el.classList.toggle('on', k === i);
    el.classList.toggle('l', k < i);
    el.classList.remove('under');
  });
  cur = n;
  $('#tsl').style.transform = `translateX(${i * 100}%)`;
  $$('#tb button').forEach((b, k) => b.classList.toggle('on', k === i));
  enter(S(n));
}
function push(n) {
  const prev = stack.length ? S(stack[stack.length - 1]) : S(cur);
  prev.classList.add('under');
  stack.push(n);
  const el = S(n); el.scrollTop = 0; el.classList.add('on'); enter(el);
}
function pop() {
  const n = stack.pop(); if (!n) return;
  S(n).classList.remove('on');
  (stack.length ? S(stack[stack.length - 1]) : S(cur)).classList.remove('under');
}
function popAll() { while (stack.length) pop() }

let tt;
const toast = m => {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200);
};
const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const mn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg>';
const setT = t => {
  document.documentElement.dataset.t = t;
  $('#th').innerHTML = t === 'dark' ? sun : mn;
  $('meta[name=theme-color]').content = t === 'dark' ? '#0D111B' : '#EFEFE7';
};
setT(localStorage.xw_theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));

document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.bt,.ad'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
  const el = document.createElement('span');
  el.className = 'ripple';
  el.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.appendChild(el); setTimeout(() => el.remove(), 600);
});

const api = async (path, body) => {
  const r = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.message || 'Gagal');
  return j;
};

// ============================================================
// REAL-TIME STREAM (produk & settings)
// ============================================================
let rawProducts = {}, rawSettings = {};

function openStream(path, onData) {
  if (typeof EventSource === 'undefined') return null;
  const es = new EventSource(`${FB}/${path}.json`);
  es.addEventListener('put', ev => {
    try {
      const d = JSON.parse(ev.data);
      if (d.path === '/') onData({ full: d.data });
      else onData({ patch: { [d.path.slice(1)]: d.data } });
    } catch {}
  });
  es.addEventListener('patch', ev => {
    try {
      const d = JSON.parse(ev.data);
      onData({ patch: d.data });
    } catch {}
  });
  es.onerror = () => { es.close(); setTimeout(() => openStream(path, onData), 3000); };
  return es;
}

openStream('products', ({ full, patch }) => {
  if (full !== undefined) rawProducts = full || {};
  else if (patch) rawProducts = Object.assign({}, rawProducts, patch);
  processProducts(rawProducts);
});
openStream('settings/store', ({ full, patch }) => {
  if (full !== undefined) rawSettings = full || {};
  else if (patch) rawSettings = Object.assign({}, rawSettings, patch);
  processSettings(rawSettings);
});

function processProducts(raw) {
  P = Object.entries(raw || {}).map(([id, p]) => ({ id, ...p }))
    .filter(p => p.a !== false && p.n)
    .sort((a, b) => (a.o || 0) - (b.o || 0) || (b.ts || 0) - (a.ts || 0));
  P = P.map(p => ({
    ...p,
    name: p.n, desc: p.d, price: p.p, cat: p.c, icon: p.i,
    color: p.col, tag: p.t, featured: p.f, active: p.a,
    createdAt: p.ts, views: p.v
  }));
  ready = true;
  const n = cart.length;
  cart = cart.filter(id => byId(id));
  if (cart.length !== n) saveCart();
  renderAll();
}
function processSettings(raw) {
  ST = {
    whatsapp: raw?.wa || '',
    announcement: raw?.ann || '',
    badges: raw?.bdg || ''
  };
  renderSettings();
}

async function syncOrder(tok) {
  try {
    const j = await api('check-status', { token: tok });
    OD[tok] = j.order;
    if (curTok === tok && stack.includes('order')) renderOrder(tok);
    renderOrders();
  } catch {}
}

// Auto-poll status order yang pending, biar halaman order pembeli update sendiri
setInterval(() => {
  myOrders.forEach(tok => {
    const o = OD[tok];
    if (!o || o.status === 'pending') syncOrder(tok);
  });
}, 15000);

// ============================================================
// RENDER
// ============================================================
function renderAll() {
  renderHome(); renderGrid(); renderCart(); renderOrders(); upd();
  if (stack.includes('detail') && curDetail) renderDetail(curDetail);
}
function renderSettings() {
  const b = (ST.badges || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4);
  $('#pills').innerHTML = b.map(x => `<span class="pl">${esc(x)}</span>`).join('');
  $('#hAnn').innerHTML = ST.announcement ? `<div class="ann">${esc(ST.announcement)}</div>` : '';
  renderOrders();
}
function renderHome() {
  const feat = P.filter(p => p.featured);
  $('#hFeat').innerHTML = feat.length
    ? `<div class="st">Unggulan <small id="fi">1/${feat.length}</small></div>
       <div class="hs" id="hs">${feat.map(p => `<div class="fc" data-act="open" data-v="${p.id}" style="background:${pcol(p)}">
       <div class="big">${renderIcon(p.icon, 120)}</div><span class="tg">${fv(p.views)} views</span>
       <div class="rw"><div><h3>${esc(p.name)}</h3><div class="pr">${p.price ? rp(p.price) : 'Gratis'}</div></div><div class="go">→</div></div></div>`).join('')}</div>
       <div class="dots" id="dots">${feat.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`
    : '';
  const hs = $('#hs');
  if (hs) hs.onscroll = () => {
    const w = hs.firstElementChild.offsetWidth + 10;
    const i = Math.min(feat.length - 1, Math.round(hs.scrollLeft / w));
    $$('#dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    $('#fi').textContent = (i + 1) + '/' + feat.length;
  };
  const pop = [...P].sort((a, b) => b.views - a.views).slice(0, 4);
  const mx = Math.max(1, ...P.map(p => p.views));
  $('#hPop').innerHTML = pop.length
    ? `<div class="st">Terpopuler <button class="lk" data-act="tab" data-v="mod">Semua →</button></div>
       <div class="lst">${pop.map(p => `<div class="li rv" data-act="open" data-v="${p.id}" style="--w:${Math.max(6, p.views / mx * 100)}%">
       <div class="tile" style="background:${pcol(p)}">${renderIcon(p.icon, 22)}</div>
       <div class="mid"><h4>${esc(p.name)}</h4><div class="bar2"><i></i></div></div><small>${fv(p.views)}</small></div>`).join('')}</div>`
    : (ready ? '<div class="emp">Belum ada produk</div>' : '');
  live($('#hPop'));
}
function renderGrid() {
  const cats = ['all', ...new Set(P.map(p => p.cat).filter(Boolean))];
  if (!cats.includes(cat)) cat = 'all';
  $('#chips').innerHTML = cats.map(c =>
    `<button class="ch ${c === cat ? 'on' : ''}" data-act="cat" data-v="${esc(c)}">${c === 'all' ? 'Semua' : esc(c)}</button>`
  ).join('');
  const l = P.filter(p => (cat === 'all' || p.cat === cat) && p.name.toLowerCase().includes(qs));
  $('#ct').textContent = l.length;
  $('#gr').innerHTML = !ready
    ? '<div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div>'
    : l.length
      ? l.map(p => `<div class="pc rv" data-act="open" data-v="${p.id}">
        <div class="vw">${eye}${fv(p.views)}</div>${p.tag ? `<div class="tgp">${esc(p.tag)}</div>` : ''}
        <div class="tile" style="background:${pcol(p)}">${renderIcon(p.icon, 34)}</div><h4>${esc(p.name)}</h4>
        <div class="m"><span class="p">${p.price ? rp(p.price) : 'Gratis'}</span>
        <button class="ad ${cart.includes(p.id) ? 'ok' : ''}" data-act="add" data-v="${p.id}">${cart.includes(p.id) ? '✓' : '+'}</button></div></div>`).join('')
      : '<div class="emp">Tidak ada</div>';
  live($('#gr'));
}
$('#q').oninput = e => { qs = e.target.value.toLowerCase().trim(); renderGrid() };

function renderCart() {
  const items = cart.map(byId).filter(Boolean);
  const total = items.reduce((s, p) => s + p.price, 0);
  $('#cn').textContent = items.length;
  $('#cBox').innerHTML = items.length
    ? `<div class="cl">${items.map(p => `<div class="ci">
        <div class="tile" data-act="open" data-v="${p.id}" style="background:${pcol(p)}">${renderIcon(p.icon, 22)}</div>
        <div class="mid"><h4>${esc(p.name)}</h4><small>${p.price ? rp(p.price) : 'Gratis'}</small></div>
        <button class="rm pop" data-act="rm" data-v="${p.id}">✕</button></div>`).join('')}</div>
       <div class="grow"></div>
       <div class="bar"><div><small>Total</small><b>${rp(total)}</b></div>
       <button class="bt" data-act="checkout">Checkout →</button></div>`
    : `<div class="em2">${bagI.replace('stroke-width="2"', 'stroke-width="1.6"')}
       <h3>Tas kosong</h3>
       <button class="bt g" data-act="tab" data-v="mod">Jelajahi modul</button></div>`;
}
function badge(o) {
  if (!o) return ['dead', '—'];
  if (o.status === 'paid') return ['paid', 'Lunas'];
  if (o.status === 'pending' && !(o.exp && Date.parse(o.exp) < Date.now())) return ['', 'Menunggu'];
  return ['dead', o.status === 'failed' ? 'Gagal' : 'Kedaluwarsa'];
}
function wa() {
  const n = String(ST.whatsapp || '').replace(/\D/g, '');
  return n
    ? `<a class="bt o" style="margin:16px 18px 0;width:auto" href="https://wa.me/${n}" target="_blank" rel="noopener">Butuh bantuan? WhatsApp</a>`
    : '';
}
function renderOrders() {
  const l = myOrders.filter(t => OD[t] !== undefined && OD[t] !== null);
  $('#oBox').innerHTML = l.length
    ? `<div class="lst" style="padding-top:14px">${l.map(t => {
        const o = OD[t]; if (!o) return `<div class="od"><div class="mid"><h4>Memuat…</h4></div></div>`;
        const [c, txt] = badge(o);
        return `<div class="od pop" data-act="order" data-v="${t}">
          <div class="mid"><h4>${esc(o.code)}</h4>
          <small>${esc((o.items || []).map(i => i.n).join(', '))}</small></div>
          <div style="text-align:right"><span class="bg ${c}">${txt}</span>
          <small style="margin-top:6px">${o.tot ? rp(o.tot) : 'Gratis'}</small></div></div>`;
      }).join('')}</div>${wa()}`
    : `<div class="em2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg><h3>Belum ada pesanan</h3></div>${wa()}`;
}
function upd() {
  $$('.bd').forEach(b => { b.textContent = cart.length; b.classList.toggle('on', cart.length > 0) });
  $$('.ad').forEach(b => {
    const o = cart.includes(b.dataset.v);
    b.textContent = o ? '✓' : '+'; b.classList.toggle('ok', o);
  });
}
const bump = () => $$('.bd').forEach(b => {
  b.classList.remove('b'); void b.offsetWidth; b.classList.add('b');
});

function renderDetail(id) {
  const p = byId(id); if (!p) { if (stack.includes('detail')) pop(); return }
  const inC = cart.includes(id);
  const rel = [...P.filter(x => x.cat === p.cat && x.id !== id), ...P.filter(x => x.cat !== p.cat && x.id !== id)].slice(0, 5);
  S('detail').innerHTML = `
  <div class="top2"><button class="ib pop" data-act="back">‹</button>
    <span class="ct" style="margin:0">${esc((p.cat || 'MODUL').toUpperCase())}</span>
    <button class="ib pop" data-act="bag">${bagI}<span class="bd ${cart.length ? 'on' : ''}">${cart.length}</span></button></div>
  <div class="dh" style="background:${pcol(p)}">${renderIcon(p.icon, 84)}</div>
  <div class="dm"><div class="ct">${fv(p.views)} VIEWS</div><h3>${esc(p.name)}</h3>
    ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
    ${rel.length ? `<div class="st">Terkait</div><div class="rel">${rel.map(r =>
      `<div class="rc" data-act="open" data-v="${r.id}"><div class="tile" style="background:${pcol(r)}">${renderIcon(r.icon, 26)}</div><h4>${esc(r.name)}</h4></div>`
    ).join('')}</div>` : ''}</div>
  <div class="grow"></div>
  <div class="bar"><div><small>${p.price ? 'harga' : 'akses'}</small>
    <b>${p.price ? rp(p.price) : 'Gratis'}</b></div>
    <button class="bt" data-act="${inC ? 'checkout' : 'add'}" data-v="${id}">${inC ? 'Checkout →' : 'Tambah +'}</button></div>`;
}
function view(id) {
  if (sessionStorage.getItem('v' + id)) return;
  sessionStorage.setItem('v' + id, '1');
  api('view', { id }).catch(() => {});
}
function openDetail(id) {
  curDetail = id; view(id);
  if (stack[stack.length - 1] === 'detail') {
    const s = S('detail'); s.style.opacity = 0;
    setTimeout(() => { renderDetail(id); s.scrollTop = 0; s.style.opacity = 1 }, 160);
    return;
  }
  renderDetail(id); push('detail');
}

function openCheckout() {
  const items = cart.map(byId).filter(Boolean);
  if (!items.length) return toast('Tas kosong');
  const total = items.reduce((s, p) => s + p.price, 0);
  const b = load('xw_buyer', {});
  S('checkout').innerHTML = `
  <div class="top2"><button class="ib pop" data-act="back">‹</button>
    <span class="ct" style="margin:0">CHECKOUT</span><span style="width:38px"></span></div>
  <div class="sum"><small>${items.length} modul</small><b>${total ? rp(total) : 'Gratis'}</b></div>
  <div class="fm">
    <label>Nama<input id="fn" value="${esc(b.name || '')}" autocomplete="name" placeholder="Nama kamu"></label>
    <label>WhatsApp / Email<input id="fc" value="${esc(b.contact || '')}" autocomplete="off" placeholder="0812xxxx atau email"></label>
    ${total ? '<div class="hint">Biaya admin QRIS (jika ada) ditampilkan di langkah berikutnya.</div>' : ''}
  </div>
  <div class="grow"></div>
  <div class="bar"><div><small>Total</small><b>${total ? rp(total) : 'Gratis'}</b></div>
    <button class="bt" data-act="pay" style="min-width:150px">${total ? 'Bayar QRIS' : 'Ambil'}</button></div>`;
  push('checkout');
}
async function pay(el) {
  const name = $('#fn').value.trim(), contact = $('#fc').value.trim();
  if (name.length < 2 || contact.length < 5) return toast('Lengkapi nama & kontak');
  save('xw_buyer', { name, contact });
  const h = el.innerHTML; el.innerHTML = '<i class="sp"></i>'; el.disabled = true;
  try {
    const j = await api('create-order', { items: cart, name, contact });
    myOrders.unshift(j.token); saveOrders();
    cart = []; saveCart();
    renderAll();
    pop();
    openOrder(j.token);
  } catch (e) {
    toast(e.message);
    el.innerHTML = h; el.disabled = false;
  }
}

function openOrder(tok) {
  curTok = tok;
  renderOrder(tok);
  if (stack[stack.length - 1] !== 'order') push('order');
  syncOrder(tok);
}
function copyTxt(t) {
  navigator.clipboard?.writeText(t).then(() => toast('Disalin ✓')).catch(() => toast('Gagal menyalin'));
}
function renderOrder(tok) {
  const o = OD[tok], box = S('order');
  const head = `<div class="top2"><button class="ib pop" data-act="back">‹</button>
    <span class="ct" style="margin:0">${esc(o ? o.code : 'PESANAN')}</span><span style="width:38px"></span></div>`;
  if (o === undefined) return box.innerHTML = head + '<div class="em2"><i class="sp"></i></div>';
  if (o === null) return box.innerHTML = head + '<div class="em2"><h3>Pesanan tidak ditemukan</h3></div>';

  if (o.status === 'paid') {
    const cf = [...Array(16)].map((_, i) => {
      const a = i / 16 * Math.PI * 2, d = 110 + Math.random() * 80;
      return `<span style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;background:${COL[i % COL.length]};animation-delay:${.3 + Math.random() * .15}s"></span>`;
    }).join('');

    const dl = (o.dl || []).map((d, i) => {
      const link = String(d.l || '');
      if (/^https?:\/\//i.test(link))
        return `<a class="dl" href="${esc(link)}" target="_blank" rel="noopener" style="animation-delay:${i * .06}s"><div>${esc(d.n)}</div><span>Buka ↗</span></a>`;
      if (link)
        return `<button class="dl" data-act="copy" data-v="${esc(link)}" style="animation-delay:${i * .06}s"><div>${esc(d.n)}<code>${esc(link)}</code></div><span>Salin</span></button>`;
      return `<div class="dl"><div>${esc(d.n)}</div><span>Hubungi admin</span></div>`;
    }).join('');

    // Balasan admin - hanya terlihat kalau status paid
    const reply = o.reply && o.reply.m ? `
      <div class="st">Pesan dari Admin</div>
      <div class="dls">
        <div class="dl" style="display:block;white-space:pre-wrap;line-height:1.6;font-weight:600">${esc(o.reply.m)}</div>
      </div>` : '';

    box.innerHTML = head + `<div style="overflow:auto;flex:1;padding-bottom:30px">
      <div class="dn"><div class="cf">${cf}</div>
        <div class="ck"><svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="54"/><path d="M34 58l16 16 30-34"/></svg></div>
        <h2>Lunas</h2><div class="cd">${esc(o.code)}</div></div>
      ${dl ? `<div class="dls">${dl}</div>` : ''}
      ${reply}
      ${wa()}</div>`;
    return;
  }

  const [, txt] = badge(o);
  if (txt === 'Menunggu') {
    box.innerHTML = head + `<div style="overflow:auto;flex:1;padding-bottom:30px">
      <div class="qrw">${o.qr ? `<img src="${esc(o.qr)}" alt="QRIS" id="qrimg">` : ''}
      <div class="cdw">Sisa waktu <b id="cd">--:--</b></div></div>
      <div class="sum"><small>Total bayar · ${(o.items || []).length} modul</small><b>${rp(o.tot)}</b></div>
      <div class="stt"><i class="pu"></i>Menunggu pembayaran</div>
      <div class="acts"><button class="bt" data-act="check">Cek status</button></div>
      ${wa()}</div>`;
    const img = $('#qrimg');
    if (img) img.onerror = () => {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'hint', textContent: 'QR gagal dimuat. Hubungi admin.' }));
    };
    return;
  }

  box.innerHTML = head + `<div class="dn"><div class="ck x"><svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="54"/><path d="M40 40l32 32M72 40L40 72"/></svg></div>
    <h2>${txt}</h2></div>
    <div class="acts" style="padding-top:22px"><button class="bt g" data-act="tab" data-v="mod">Pesan lagi</button></div>${wa()}`;
}
async function checkStatus(silent) {
  const tok = curTok; if (!tok) return;
  try {
    const j = await api('check-status', { token: tok });
    OD[tok] = j.order;
    renderOrder(tok); renderOrders();
    if (!silent) toast(j.order.status === 'paid' ? 'Pembayaran diterima ✓' : j.retry_after ? `Coba lagi ${j.retry_after} dtk` : 'Belum ada pembayaran');
  } catch {
    if (!silent) toast('Gagal mengecek');
  }
}
setInterval(() => {
  const o = OD[curTok], el = $('#cd');
  if (!o || !el || !o.exp || !stack.includes('order')) return;
  const s = Math.floor((Date.parse(o.exp) - Date.now()) / 1000);
  if (s <= 0) { renderOrder(curTok); renderOrders(); return }
  el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}, 1000);
setInterval(() => {
  const o = OD[curTok];
  if (o && o.status === 'pending' && stack.includes('order')) checkStatus(true);
}, 25000);

function add(id, btn) {
  if (cart.includes(id)) return toast('Sudah ada di tas');
  cart.push(id); saveCart(); vib(12);
  const tgt = stack.includes('detail') ? $('#s-detail [data-act=bag]') : $('#tb button:last-child');
  if (btn && tgt) {
    const r = btn.getBoundingClientRect(), t = tgt.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'fly';
    f.style.left = r.left + r.width / 2 - 8 + 'px';
    f.style.top = r.top + r.height / 2 - 8 + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(() => {
      f.style.transform = `translate(${t.left + t.width / 2 - r.left - r.width / 2}px,${t.top + t.height / 2 - r.top - r.height / 2}px) scale(.4)`;
      f.style.opacity = '.3';
    });
    setTimeout(() => { f.remove(); bump() }, 700);
  } else bump();
  toast(byId(id).name + ' ditambah');
  renderCart(); upd();
  if (stack.includes('detail') && curDetail) renderDetail(curDetail);
}

const A = {
  tab: v => tab(v),
  back: () => pop(),
  bag: () => { popAll(); tab('cart') },
  open: v => openDetail(v),
  add: (v, el) => add(v, el),
  rm: (v, el) => {
    const row = el.closest('.ci');
    row.style.opacity = 0; row.style.transform = 'translateX(50px)';
    setTimeout(() => { cart = cart.filter(x => x !== v); saveCart(); renderCart(); upd() }, 350);
  },
  checkout: () => openCheckout(),
  pay: (v, el) => pay(el),
  order: v => openOrder(v),
  check: () => checkStatus(false),
  copy: v => copyTxt(v),
  cat: v => {
    cat = v;
    $$('.pc').forEach(x => { x.style.opacity = 0; x.style.transform = 'scale(.92)' });
    setTimeout(renderGrid, 200);
  },
  theme: () => {
    const t = document.documentElement.dataset.t === 'dark' ? 'light' : 'dark';
    localStorage.setItem('xw_theme', t); setT(t);
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  e.preventDefault(); vib(6);
  A[el.dataset.act]?.(el.dataset.v, el);
});

tab('home');