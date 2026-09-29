// ============================================================
// XWEB ENGINE — 3D Scene (Three.js)
// Hero icosahedron + floating shapes di dashboard
// ============================================================
import * as THREE from 'three';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ---------- Palette yang konsisten dengan CSS ----------
const C = {
  accent:  0x4C7DFF,
  accent2: 0x7B9DFF,
  warm:    0xE5B565,
  ink:     0xEEF2FA
};

const isDark = () => document.documentElement.dataset.t !== 'light';

// ============================================================
// HERO — Icosahedron wireframe + inner solid, pointer interactive
// ============================================================
function initHero() {
  const canvas = document.getElementById('hero3d');
  if (!canvas || REDUCED) return;

  const rect = () => canvas.getBoundingClientRect();
  let W = 1, H = 1;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !IS_MOBILE,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  // Lights
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(amb);
  const key = new THREE.DirectionalLight(C.accent, 1.6);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(C.warm, 1.0);
  rim.position.set(-4, -2, 3);
  scene.add(rim);
  const back = new THREE.PointLight(C.accent2, 1.2, 20);
  back.position.set(0, 0, -4);
  scene.add(back);

  // Group utama
  const group = new THREE.Group();
  scene.add(group);

  // Outer wireframe icosahedron
  const icoGeo = new THREE.IcosahedronGeometry(1.85, 1);
  const icoMat = new THREE.MeshBasicMaterial({
    color: C.accent,
    wireframe: true,
    transparent: true,
    opacity: 0.55
  });
  const ico = new THREE.Mesh(icoGeo, icoMat);
  group.add(ico);

  // Inner solid — glass-like
  const innerGeo = new THREE.IcosahedronGeometry(1.1, 0);
  const innerMat = new THREE.MeshStandardMaterial({
    color: C.accent2,
    emissive: C.accent,
    emissiveIntensity: 0.45,
    metalness: 0.7,
    roughness: 0.25,
    flatShading: true,
    transparent: true,
    opacity: 0.85
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  group.add(inner);

  // Orbiting tiny spheres
  const orbiters = [];
  const orbitCount = IS_MOBILE ? 4 : 6;
  for (let i = 0; i < orbitCount; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: i % 2 ? C.warm : C.accent2 })
    );
    const a = (i / orbitCount) * Math.PI * 2;
    s.position.set(Math.cos(a) * 2.6, Math.sin(a * 1.3) * 1.2, Math.sin(a) * 2.6);
    group.add(s);
    orbiters.push({ mesh: s, angle: a, radius: 2.6, speed: 0.15 + i * 0.04, yPhase: i * 0.9 });
  }

  // Dots ring
  const ringGeo = new THREE.BufferGeometry();
  const ringCount = IS_MOBILE ? 40 : 80;
  const positions = new Float32Array(ringCount * 3);
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2;
    const r = 2.85 + Math.random() * 0.15;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const ringMat = new THREE.PointsMaterial({
    color: C.accent2,
    size: 0.055,
    transparent: true,
    opacity: 0.75,
    sizeAttenuation: true
  });
  const ring = new THREE.Points(ringGeo, ringMat);
  group.add(ring);

  // Pointer follow (smooth)
  let px = 0, py = 0, tx = 0, ty = 0;
  const onMove = e => {
    const r = rect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  // Touch untuk mobile
  window.addEventListener('touchmove', e => {
    if (!e.touches[0]) return;
    onMove(e.touches[0]);
  }, { passive: true });

  function resize() {
    const r = rect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Intro animation — masuk dari kejauhan
  const intro = { t: 0 };
  camera.position.z = 14;
  camera.rotation.x = -0.4;

  const clock = new THREE.Clock();
  let raf = 0;

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Intro easing
    if (intro.t < 1) {
      intro.t = Math.min(1, intro.t + dt * 0.9);
      const e = 1 - Math.pow(1 - intro.t, 3);
      camera.position.z = 14 - e * 8;
      camera.rotation.x = -0.4 + e * 0.4;
    }

    // Smooth pointer
    px += (tx - px) * 0.06;
    py += (ty - py) * 0.06;

    // Rotate group
    group.rotation.y += dt * 0.25;
    group.rotation.x = py * 0.35 + Math.sin(t * 0.4) * 0.08;
    group.rotation.z = px * 0.15;

    // Orbiting spheres
    for (const o of orbiters) {
      o.angle += dt * o.speed;
      o.mesh.position.x = Math.cos(o.angle) * o.radius;
      o.mesh.position.z = Math.sin(o.angle) * o.radius;
      o.mesh.position.y = Math.sin(t * 0.8 + o.yPhase) * 1.3;
    }

    // Ring subtle rotation
    ring.rotation.y += dt * 0.4;

    // Emissive pulse
    innerMat.emissiveIntensity = 0.35 + Math.sin(t * 2.2) * 0.15;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  // Pause kalau off-screen (hemat baterai)
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (!raf) loop(); }
    else { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: 0 });
  io.observe(canvas);
}

// ============================================================
// FLOATING SHAPES — 3 canvas kecil untuk dashboard
// ============================================================
function initFloats() {
  if (REDUCED) return;
  const nodes = document.querySelectorAll('.float3d');
  if (!nodes.length) return;

  const makeScene = (shape, canvas) => {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !IS_MOBILE,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0, 4.5);

    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(amb);
    const l1 = new THREE.DirectionalLight(C.accent, 1.4);
    l1.position.set(2, 3, 4);
    scene.add(l1);
    const l2 = new THREE.DirectionalLight(C.warm, 0.8);
    l2.position.set(-3, -1, 2);
    scene.add(l2);

    let mesh;
    const wire = new THREE.MeshBasicMaterial({
      color: C.accent,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    const solid = new THREE.MeshStandardMaterial({
      color: C.accent2,
      emissive: C.accent,
      emissiveIntensity: 0.35,
      metalness: 0.6,
      roughness: 0.3,
      flatShading: true,
      transparent: true,
      opacity: 0.9
    });

    if (shape === 'ico') {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), wire);
    } else if (shape === 'octa') {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), solid);
    } else if (shape === 'torus') {
      mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.28, 12, 28),
        new THREE.MeshStandardMaterial({
          color: C.warm,
          emissive: C.warm,
          emissiveIntensity: 0.3,
          metalness: 0.8,
          roughness: 0.2,
          flatShading: true
        })
      );
    }
    scene.add(mesh);

    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return { renderer, scene, camera, mesh, resize };
  };

  const scenes = [...nodes].map(n => ({
    node: n,
    ...makeScene(n.dataset.shape || 'ico', n)
  }));

  const clock = new THREE.Clock();
  let raf = 0;
  function loop() {
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    for (const s of scenes) {
      s.mesh.rotation.x += dt * 0.4;
      s.mesh.rotation.y += dt * 0.6;
      // float
      s.node.style.transform = `translateY(${Math.sin(t * 1.2 + s.node.dataset.shape?.charCodeAt(0) || 0) * 6}px)`;
      s.renderer.render(s.scene, s.camera);
    }
    raf = requestAnimationFrame(loop);
  }
  loop();

  // Pause kalau semua off-screen
  let visible = 0;
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) visible++; else visible = Math.max(0, visible - 1); });
    if (visible > 0 && !raf) loop();
    else if (visible === 0 && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: 0 });
  nodes.forEach(n => io.observe(n));
}

// ============================================================
// THEME SYNC — update warna light/dark
// ============================================================
function syncTheme() {
  // Placeholder: colors di-set sekali. Kalau mau live-swap, bisa ditambahkan.
  // Untuk sekarang, scene tetap pakai accent blue di kedua mode (kontras tetap bagus).
}

// Boot
window.addEventListener('load', () => {
  initHero();
  initFloats();
});
new MutationObserver(() => syncTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-t'] });