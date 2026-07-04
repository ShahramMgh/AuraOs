/* ============================================================================
   Aura — the living companion at the heart of AuraOS
   ----------------------------------------------------------------------------
   The Aura is the resident intelligence given a body: a soft being of light that
   lives in the phone. It breathes, it gazes toward your touch, it blooms when you
   speak to it — and, crucially, it *reacts when a sensor goes live*, so privacy
   is felt as a companion watching over you rather than read from a cold dot.

   Pure canvas, additive light. One rAF loop, paused whenever home isn't on
   screen (a calm pet shouldn't cost battery), and it honours reduced-motion.
   Identity, not decoration: calm teal when private; a warm bloom when engaged;
   the sensor's own colour, urgently, when something is watching.
   ============================================================================ */
const Aura = (() => {
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // moods — the Aura's palette of feeling
  const MOOD = {
    calm:      { col: [58, 200, 224], glow: 0.9, speed: 1.0, urgency: 0 },
    attentive: { col: [130, 232, 246], glow: 1.15, speed: 1.8, urgency: 0 },
    mic:       { col: [224, 160, 42], glow: 1.1, speed: 2.2, urgency: 1 },
    cam:       { col: [226, 73, 73], glow: 1.15, speed: 2.6, urgency: 1 },
    loc:       { col: [70, 170, 235], glow: 1.1, speed: 2.2, urgency: 1 },
  };

  let canvas, ctx, W, H, dpr, cx, cy, R;
  let raf = 0, t0 = 0, running = false, reduced = false;
  let onTap = null;
  const state = {
    col: MOOD.calm.col.slice(), glow: 0.9, speed: 1.0, urgency: 0,   // live (lerped)
    target: 'calm', attentUntil: 0, bloom: 0,
    gx: 0, gy: 0, tgx: 0, tgy: 0,                                     // gaze
  };
  let motes = [];

  function mount(cvs, opts = {}) {
    destroy();
    canvas = cvs; ctx = canvas.getContext('2d');
    onTap = opts.onTap;
    reduced = !!opts.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', layout);
    layout();
    // the Aura's orbiting motes — its faint field
    const r = mulberry(20240707);
    motes = Array.from({ length: 7 }, () => ({
      a: r() * TAU, rad: 0.62 + r() * 0.5, sp: (0.15 + r() * 0.35) * (r() < 0.5 ? -1 : 1),
      sz: 0.6 + r() * 1.4, tw: r() * TAU,
    }));
    t0 = performance.now();
    if (reduced) draw(0); else start();
  }

  function layout() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    W = rect.width || 200; H = rect.height || 200;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.24;
    if (reduced) draw(0);
  }

  // ---- outward API -------------------------------------------------------
  // Theme the Aura's resting light. Sensor moods (mic/cam/loc) keep their own
  // semantic colours — a red camera warning must stay red on every theme.
  function setPalette(rgb) {
    if (!rgb || rgb.length !== 3) return;
    MOOD.calm.col = rgb.slice();
    MOOD.attentive.col = rgb.map(c => Math.round(c + (255 - c) * 0.45));
  }

  function setSensors(list) {
    // list of 'mic'|'cam'|'loc' currently active; priority cam > mic > loc
    const pick = list && (list.includes('cam') ? 'cam' : list.includes('mic') ? 'mic' : list.includes('loc') ? 'loc' : null);
    state.target = pick || (performance.now() < state.attentUntil ? 'attentive' : 'calm');
  }
  function attend() { state.attentUntil = performance.now() + 2600; if (state.target === 'calm') state.target = 'attentive'; }
  function bloom() { state.bloom = 1; attend(); }

  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    state.tgx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;   // -1..1
    state.tgy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }
  function onDown() { bloom(); if (onTap) onTap(); }

  // ---- loop --------------------------------------------------------------
  function start() { if (running || reduced) return; running = true; const l = n => { if (!running) return; draw((n - t0) / 1000); raf = requestAnimationFrame(l); }; raf = requestAnimationFrame(l); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function draw(t) {
    if (!ctx) return;
    const m = MOOD[state.target] || MOOD.calm;
    state.col = mix(state.col, m.col, 0.06);
    state.glow = lerp(state.glow, m.glow, 0.06);
    state.speed = lerp(state.speed, m.speed, 0.06);
    state.urgency = lerp(state.urgency, m.urgency, 0.06);
    state.gx = lerp(state.gx, state.tgx, 0.08); state.gy = lerp(state.gy, state.tgy, 0.08);
    if (state.bloom > 0.001) state.bloom = Math.max(0, state.bloom - 0.018); else state.bloom = 0;

    ctx.clearRect(0, 0, W, H);
    const breathe = reduced ? 1 : 1 + 0.045 * Math.sin(t * 1.1 * state.speed)
      + state.urgency * 0.05 * Math.sin(t * 6);
    const r = R * breathe * (1 + state.bloom * 0.12);
    const ox = cx + state.gx * R * 0.16, oy = cy + state.gy * R * 0.16;   // gaze offset
    const col = state.col, g = state.glow;

    ctx.globalCompositeOperation = 'lighter';

    // outer aura glow
    paintRadial(cx, cy, r * 2.7, [
      [0, rgba(col, 0.10 * g)], [0.5, rgba(col, 0.05 * g)], [1, rgba(col, 0)]]);

    // living plasma — 3 slow lobes drifting inside the body
    for (let i = 0; i < 3; i++) {
      const a = t * (0.25 + i * 0.12) * state.speed + i * 2.1;
      const lr = r * (0.34 + 0.1 * Math.sin(t * 0.7 + i));
      const lx = ox + Math.cos(a) * lr, ly = oy + Math.sin(a) * lr;
      const lc = mix(col, [255, 255, 255], 0.15 + i * 0.12);
      paintRadial(lx, ly, r * 0.95, [
        [0, rgba(lc, 0.42 * g)], [0.6, rgba(lc, 0.12 * g)], [1, rgba(lc, 0)]]);
    }

    // body + bright core
    paintRadial(ox, oy, r * 1.25, [
      [0, rgba(col, 0.55 * g)], [0.55, rgba(col, 0.22 * g)], [1, rgba(col, 0)]]);
    // core: bright white when calm, but holds the sensor's colour when urgent so
    // "camera = red" reads clearly rather than washing out to white.
    const coreWhite = 0.72 - state.urgency * 0.42;
    paintRadial(ox, oy, r * 0.52, [
      [0, rgba(mix(col, [255, 255, 255], coreWhite), 0.95)], [0.7, rgba(col, 0.4)], [1, rgba(col, 0)]]);

    // orbiting motes (the Aura's field)
    for (const mo of motes) {
      const a = mo.a + t * mo.sp * state.speed;
      const mr = r * (mo.rad + 0.06 * Math.sin(t + mo.tw));
      const mx = ox + Math.cos(a) * mr * 1.15, my = oy + Math.sin(a) * mr * 0.95;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + mo.tw);
      paintRadial(mx, my, mo.sz * 3.2, [
        [0, rgba(mix(col, [255, 255, 255], 0.4), 0.7 * tw)], [1, rgba(col, 0)]]);
    }

    ctx.globalCompositeOperation = 'source-over';

    // aura ring — a thin halo; pulses with urgency / bloom
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.55, 0, TAU);
    ctx.strokeStyle = rgba(col, 0.16 + state.urgency * 0.14 * (0.5 + 0.5 * Math.sin(t * 5)));
    ctx.lineWidth = 1.2; ctx.stroke();

    // bloom shockwave on tap
    if (state.bloom > 0) {
      const br = r * (1.4 + (1 - state.bloom) * 1.6);
      ctx.beginPath(); ctx.arc(cx, cy, br, 0, TAU);
      ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.4), state.bloom * 0.5);
      ctx.lineWidth = 2 * state.bloom + 0.5; ctx.stroke();
    }
  }

  function paintRadial(x, y, rad, stops) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, rad));
    for (const [o, c] of stops) grad.addColorStop(o, c);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }

  function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function destroy() {
    stop();
    if (canvas) {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', layout);
    }
  }

  return { mount, start, stop, setSensors, setPalette, attend, bloom, destroy };
})();
