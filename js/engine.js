// Shared canvas plumbing + drawing helpers for the challenge modules.
// Each challenge draws in a fixed virtual space (default 360x600) that is
// letterboxed to fit whatever screen it lands on.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const C = {
  turf: '#2e7a3c',
  turf2: '#2a7036',
  bg: '#0b1422',
  o: '#f6f1e3',
  oHelmet: '#ffc83d',
  x: '#ff6b5a',
  xHelmet: '#7a1f2b',
  gold: '#ffc83d',
  good: '#5ef08a',
  bad: '#ff5d5d',
  ink: '#0b1422',
};

export function createStage(host, W = 360, H = 600) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const view = { W, H, scale: 1, ox: 0, oy: 0, dpr: 1, shake: 0 };

  function resize() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    view.scale = Math.min(r.width / W, r.height / H);
    view.ox = (r.width - W * view.scale) / 2;
    view.oy = (r.height - H * view.scale) / 2;
    view.dpr = dpr;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Clear the whole canvas, then switch to virtual coordinates (with optional shake).
  function begin(bg = C.bg) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = view.dpr * view.scale;
    let sx = 0, sy = 0;
    if (view.shake > 0) {
      sx = (Math.random() - 0.5) * view.shake * 10;
      sy = (Math.random() - 0.5) * view.shake * 10;
    }
    ctx.setTransform(s, 0, 0, s, view.dpr * view.ox + sx * s, view.dpr * view.oy + sy * s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
  }
  function end() {
    ctx.restore();
  }

  function toVirtual(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
  }

  let raf = 0;
  let running = false;
  function loop(fn) {
    running = true;
    let last = performance.now();
    const tick = (t) => {
      if (!running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      view.shake = Math.max(0, view.shake - dt * 3);
      fn(dt, t / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  const cleanups = [];
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  function destroy() {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    cleanups.forEach((f) => f());
    canvas.remove();
  }

  return { canvas, ctx, view, W, H, begin, end, toVirtual, loop, on, destroy, shake: (n = 1) => (view.shake = n) };
}

export function buzz(ms = 15) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not supported */ }
}

// Pop-up text and particle bursts. Cosmetic only (uses Math.random, never affects scoring).
export class Floaters {
  constructor() { this.items = []; }
  text(x, y, str, { color = '#fff', size = 26, life = 1.1, rise = 40 } = {}) {
    this.items.push({ kind: 't', x, y, str, color, size, life, rise, t: 0 });
  }
  burst(x, y, color = '#fff', n = 14, speed = 150) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.items.push({ kind: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, r: 1.5 + Math.random() * 2.5, life: 0.45 + Math.random() * 0.35, t: 0 });
    }
  }
  ring(x, y, color = '#fff', r0 = 8, r1 = 40, life = 0.5) {
    this.items.push({ kind: 'r', x, y, color, r0, r1, life, t: 0 });
  }
  update(dt) {
    for (const f of this.items) {
      f.t += dt;
      if (f.kind === 'p') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 0.92;
        f.vy *= 0.92;
      }
    }
    this.items = this.items.filter((f) => f.t < f.life);
  }
  draw(ctx) {
    for (const f of this.items) {
      const k = f.t / f.life;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      if (f.kind === 't') {
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.5);
        ctx.translate(f.x, f.y - easeOut(k) * f.rise);
        ctx.scale(pop, pop);
        ctx.font = `900 ${f.size}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.strokeText(f.str, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.str, 0, 0);
      } else if (f.kind === 'p') {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * (1 - k);
        ctx.beginPath();
        ctx.arc(f.x, f.y, lerp(f.r0, f.r1, easeOut(k)), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function label(ctx, str, x, y, { size = 16, color = '#fff', align = 'center', weight = 800, stroke = true } = {}) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// Top-down turf with stripes and yard lines. `scroll` slides the lines downward.
export function drawTurfTop(ctx, W, H, scroll = 0, step = 60) {
  ctx.fillStyle = C.turf;
  ctx.fillRect(0, 0, W, H);
  const off = ((scroll % (step * 2)) + step * 2) % (step * 2);
  ctx.fillStyle = C.turf2;
  for (let y = -step * 2 + off; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  ctx.strokeStyle = 'rgba(255,255,255,.32)';
  ctx.lineWidth = 2;
  for (let y = -step * 2 + off; y < H + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 1.5;
  for (let y = -step * 2 + off; y < H + step; y += step / 5) {
    for (const x of [W * 0.39, W * 0.61]) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.stroke();
    }
  }
}

// Top-down player: shoulder pads + helmet, facing up (-y) before rotation.
export function topPlayer(ctx, x, y, o = {}) {
  const { body = C.o, helmet = C.oHelmet, rot = 0, s = 1, sx = 1, sy = 1, alpha = 1, glow } = o;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * s, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, 15 * s, 9 * s, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(rot);
  ctx.scale(s * sx, s * sy);
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 1, 14, 8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -2, 6.5, -2.4, -0.74);
  ctx.stroke();
  ctx.restore();
}

// Side-view player standing on groundY. face: 1 = facing right, -1 = left.
export function sidePlayer(ctx, x, groundY, o = {}) {
  const { jersey = C.o, pants = '#d8cfb8', helmet = C.oHelmet, face = 1, pose = 'stand', t = 0, lift = 0, s = 1, ball = false } = o;
  ctx.save();
  ctx.translate(x, groundY);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16 * s * (1 - Math.min(0.5, lift / 120)), 4 * s, 0, 0, TAU);
  ctx.fill();
  ctx.translate(0, -lift);
  ctx.scale(face * s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stride = pose === 'run' ? Math.sin(t * 16) * 9 : pose === 'jump' ? 3 : 4;
  ctx.strokeStyle = pants;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-3, -34);
  ctx.lineTo(-3 - stride, -1);
  ctx.moveTo(3, -34);
  ctx.lineTo(3 + stride, -1);
  ctx.stroke();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-3 - stride - 2, -1);
  ctx.lineTo(-3 - stride + 4, -1);
  ctx.moveTo(3 + stride - 2, -1);
  ctx.lineTo(3 + stride + 4, -1);
  ctx.stroke();
  ctx.fillStyle = jersey;
  roundRect(ctx, -11, -64, 22, 32, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = jersey;
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (pose === 'throw') {
    ctx.moveTo(-4, -58); ctx.lineTo(-14, -70); ctx.lineTo(-16, -86);
    ctx.moveTo(6, -56); ctx.lineTo(16, -50);
  } else if (pose === 'follow') {
    ctx.moveTo(4, -58); ctx.lineTo(18, -62); ctx.lineTo(26, -54);
    ctx.moveTo(-4, -56); ctx.lineTo(-12, -46);
  } else if (pose === 'jump') {
    ctx.moveTo(-3, -60); ctx.lineTo(-2, -78); ctx.lineTo(0, -94);
    ctx.moveTo(4, -60); ctx.lineTo(7, -78); ctx.lineTo(9, -94);
  } else if (pose === 'run') {
    const a = Math.sin(t * 16) * 8;
    ctx.moveTo(0, -58); ctx.lineTo(8 + a, -46);
    ctx.moveTo(0, -58); ctx.lineTo(-8 - a, -46);
  } else {
    ctx.moveTo(-6, -58); ctx.lineTo(-8, -40);
    ctx.moveTo(6, -58); ctx.lineTo(10, -42);
  }
  ctx.stroke();
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(1, -73, 9.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, -78); ctx.lineTo(12, -70); ctx.lineTo(8, -65);
  ctx.moveTo(8, -72); ctx.lineTo(12, -72);
  ctx.stroke();
  if (ball) drawBall(ctx, pose === 'throw' ? -16 : 12, pose === 'throw' ? -90 : -48, 1, -0.6);
  ctx.restore();
}

export function drawBall(ctx, x, y, s = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = '#8a4b22';
  ctx.strokeStyle = '#3d1f0c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 3.8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.stroke();
  ctx.restore();
}
