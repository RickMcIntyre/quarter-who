// Challenge 3 — IQ. Five reads on a chalk-style X's-and-O's diagram:
//   open  — watch routes develop, tap the open receiver
//   blitz — watch the pre-snap creep, tap the blitzer
//   shell — watch the safeties rotate at the snap, call 0/1/2-high
// Score per read = correct ? 60 + up to 40 speed bonus : 0 (full bonus inside the first 30% of the clock).
import { createStage, Floaters, clamp, lerp, easeOut, easeInOut, C, TAU, buzz, drawBall, label, roundRect } from './engine.js';

export const meta = {
  id: 'iq',
  title: 'IQ',
  icon: '🧠',
  howTo: [
    '<b>Find the open man</b> — watch the routes, tap the receiver with the most space.',
    "<b>Who's blitzing?</b> — watch the pre-snap creep, tap the defender coming after you.",
    '<b>Read the shell</b> — how many deep safeties after the snap? 0, 1 or 2.',
    'The shot clock starts when the play freezes. Faster correct reads score a bit more.',
  ],
};

const W = 360, H = 600;
const LOS = 360;
const OL = [132, 156, 180, 204, 228];
const QBP = { x: 180, y: 420 };

const FORMS = [
  [{ x: 30, y: LOS + 8 }, { x: 92, y: LOS + 14 }, { x: 268, y: LOS + 14 }, { x: 330, y: LOS + 8 }],
  [{ x: 30, y: LOS + 8 }, { x: 250, y: LOS + 14 }, { x: 292, y: LOS + 14 }, { x: 330, y: LOS + 8 }],
  [{ x: 30, y: LOS + 8 }, { x: 92, y: LOS + 14 }, { x: 330, y: LOS + 8 }, { x: 212, y: QBP.y, rb: true }],
];
// Waypoints are offsets from the receiver's start; +dx = toward the middle of the field.
const ROUTES = {
  go: [[0, -230]],
  slant: [[0, -28], [80, -100]],
  out: [[0, -110], [-55, -110]],
  dig: [[0, -130], [120, -130]],
  post: [[0, -120], [70, -215]],
  curl: [[0, -135], [12, -115]],
  corner: [[0, -110], [-60, -190]],
  seam: [[6, -205]],
};
const RB_ROUTES = { flat: [[20, -10], [100, -30]], angle: [[30, -14], [-20, -90]], wheel: [[50, -10], [110, -60], [110, -170]] };

function buildPath(start, wps, rb) {
  const sign = rb ? 1 : start.x < 180 ? 1 : -1;
  const pts = [{ x: start.x, y: start.y }];
  for (const [dx, dy] of wps) pts.push({ x: clamp(start.x + dx * sign, 16, 344), y: Math.max(48, start.y + dy) });
  const seg = [];
  let L = 0;
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    seg.push(l);
    L += l;
  }
  return { pts, seg, L };
}

function along(path, p) {
  let d = path.L * clamp(p);
  for (let k = 0; k < path.seg.length; k++) {
    if (d <= path.seg[k]) {
      const f = path.seg[k] ? d / path.seg[k] : 0;
      return { x: lerp(path.pts[k].x, path.pts[k + 1].x, f), y: lerp(path.pts[k].y, path.pts[k + 1].y, f) };
    }
    d -= path.seg[k];
  }
  return path.pts[path.pts.length - 1];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeOpen(rng) {
  const form = FORMS[rng.int(0, FORMS.length - 1)];
  const names = Object.keys(ROUTES);
  const recs = form.map((s) => {
    const rb = !!s.rb;
    const name = rb ? rng.pick(Object.keys(RB_ROUTES)) : rng.pick(names);
    return { start: s, rb, name, path: buildPath(s, rb ? RB_ROUTES[name] : ROUTES[name], rb) };
  });
  const open = rng.int(0, recs.length - 1);
  const ends = recs.map((r) => r.path.pts[r.path.pts.length - 1]);
  const defs = recs.map((r, k) => {
    const wide = r.start.x < 60 || r.start.x > 300;
    const start = { x: r.start.x + rng.range(-8, 8), y: r.rb ? LOS - 44 : wide ? LOS - 66 : LOS - 48 };
    let ox = 0, oy = 0;
    // pick an offset that stays on screen and (for the open man) doesn't land on another receiver
    for (let tries = 0; tries < 12; tries++) {
      const ang = rng.range(0, TAU);
      const off = k === open ? rng.range(72, 90) : rng.range(6, 11);
      ox = Math.cos(ang) * off;
      oy = Math.sin(ang) * off;
      const e = { x: ends[k].x + ox, y: ends[k].y + oy };
      const inBounds = e.x > 14 && e.x < 346 && e.y > 40 && e.y < LOS + 20;
      const clear = k !== open || ends.every((o, j) => j === k || dist(o, e) > 40);
      if (inBounds && clear) break;
    }
    return { start, ox, oy, rec: k, open: k === open };
  });
  // the safety rolls over the top of the deepest covered receiver
  let deep = -1;
  ends.forEach((e, k) => { if (k !== open && (deep < 0 || e.y < ends[deep].y)) deep = k; });
  const safety = { start: { x: 180 + rng.range(-20, 20), y: 150 }, end: { x: ends[deep].x + rng.range(-10, 10), y: Math.max(44, ends[deep].y - 24) } };
  const mike = { start: { x: 180, y: LOS - 50 }, end: { x: 180 + rng.range(-40, 40), y: LOS - 105 } };
  return { kind: 'open', prompt: 'FIND THE OPEN MAN', recs, defs, open, safety, mike, snap: 0.45, show: 2.1 };
}

const DEF_BASE = [
  { role: 'DL', x: 142, y: LOS - 14 }, { role: 'DL', x: 168, y: LOS - 14 }, { role: 'DL', x: 194, y: LOS - 14 }, { role: 'DL', x: 220, y: LOS - 14 },
  { role: 'LB', x: 122, y: LOS - 56 }, { role: 'LB', x: 180, y: LOS - 62 }, { role: 'LB', x: 238, y: LOS - 56 },
  { role: 'CB', x: 32, y: LOS - 62 }, { role: 'CB', x: 328, y: LOS - 62 },
  { role: 'S', x: 112, y: LOS - 170 }, { role: 'S', x: 248, y: LOS - 170 },
];

function baseDefense(rng, skipSafeties = false) {
  return DEF_BASE.filter((d) => !(skipSafeties && d.role === 'S')).map((d) => {
    const start = { x: d.x + rng.range(-5, 5), y: d.y + rng.range(-5, 5) };
    return { role: d.role, start, end: { x: start.x + rng.range(-6, 6), y: start.y + rng.range(-6, 6) } };
  });
}

function makeBlitz(rng) {
  const defs = baseDefense(rng);
  const cands = [4, 5, 6, 7, 8, 9, 10];
  const b = rng.pick(cands);
  const bd = defs[b];
  if (bd.role === 'LB') bd.end = { x: rng.pick([155, 181, 207]) + rng.range(-3, 3), y: LOS - 26 };
  if (bd.role === 'S') bd.end = { x: bd.start.x < 180 ? 126 : 234, y: LOS - 44 };
  if (bd.role === 'CB') bd.end = { x: bd.start.x < 180 ? 84 : 276, y: LOS - 28 };
  bd.blitz = true;
  // a decoy shows blitz, then bails back out
  const dk = rng.pick(cands.filter((c) => c !== b));
  defs[dk].fake = { x: lerp(defs[dk].start.x, 180, 0.25), y: defs[dk].start.y + 34 };
  return { kind: 'blitz', prompt: "WHO'S BLITZING?", defs, blitzer: b, recs: FORMS[0].map((s) => ({ start: s })), show: 1.9 };
}

function shellSpots(n, side) {
  if (n === 2) return [{ x: 100, y: LOS - 178 }, { x: 260, y: LOS - 178 }];
  if (n === 1) return side ? [{ x: 182, y: LOS - 210 }, { x: 252, y: LOS - 70 }] : [{ x: 108, y: LOS - 70 }, { x: 178, y: LOS - 210 }];
  return [{ x: 134, y: LOS - 52 }, { x: 228, y: LOS - 52 }];
}

function makeShell(rng) {
  const answer = rng.int(0, 2);
  // usually disguised: show one look pre-snap, rotate to another at the snap
  const startN = rng.chance(0.25) ? answer : answer === 2 ? 1 : 2;
  const side = rng.chance(0.5);
  const from = shellSpots(startN, rng.chance(0.5));
  const to = shellSpots(answer, side);
  const defs = baseDefense(rng, true);
  // corners: press for Cover 0, bail for 2-high
  defs.filter((d) => d.role === 'CB').forEach((d) => {
    if (answer === 0) d.end = { x: d.start.x < 180 ? 36 : 324, y: LOS - 22 };
    if (answer === 2) d.end = { x: d.start.x, y: LOS - 80 };
  });
  const safeties = [0, 1].map((k) => ({ role: 'S', start: { x: from[k].x + rng.range(-6, 6), y: from[k].y + rng.range(-6, 6) }, end: to[k] }));
  return { kind: 'shell', prompt: 'READ THE SHELL', defs: defs.concat(safeties), answer, recs: FORMS[0].map((s) => ({ start: s })), snap: 0.9, show: 2.0 };
}

const BTN = [0, 1, 2].map((n) => ({ n, x: 18 + n * 112, y: 516, w: 100, h: 50 }));

export function run({ host, rng, build, hud }) {
  return new Promise((resolve) => {
    const stage = createStage(host, W, H);
    const { ctx } = stage;
    const fx = new Floaters();
    const hN = clamp((build.height - 70) / 8);
    const LIMIT = 6 + hN * 0.8; // taller QBs see over the line: a touch more time
    const kinds = rng.shuffle(['open', 'open', 'blitz', 'shell', rng.pick(['open', 'blitz', 'shell'])]);
    const reads = kinds.map((k) => (k === 'open' ? makeOpen(rng) : k === 'blitz' ? makeBlitz(rng) : makeShell(rng)));
    const scores = [];
    let i = -1, r = null;

    function next() {
      i++;
      if (i >= reads.length) {
        stage.destroy();
        resolve({ score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), detail: scores });
        return;
      }
      r = { ...reads[i], t: 0, phase: 'show', left: LIMIT, pick: null, correct: false, fb: 0 };
      hud.status(`Read ${i + 1} of 5`);
      hud.pips(scores, reads.length);
    }

    function answer(correct, pick) {
      if (r.phase !== 'answer') return;
      r.phase = 'feedback';
      r.pick = pick;
      r.correct = correct;
      const s = correct ? Math.round(60 + 40 * Math.min(1, r.left / (LIMIT * 0.7))) : 0;
      scores.push(s);
      hud.pips(scores, reads.length);
      fx.text(W / 2, 470, correct ? (s >= 85 ? 'INSTANT READ!' : 'GOOD READ') : r.left <= 0 ? 'TOO SLOW' : 'WRONG READ', { color: correct ? C.good : C.bad, size: 26, life: 1.3 });
      fx.text(W / 2, 500, `+${s}`, { size: 18, life: 1.3 });
      buzz(correct ? 15 : [30, 30, 30]);
      if (!correct) stage.shake(0.5);
    }

    // ---- positions over time ----
    function openState(t) {
      const p = clamp((t - r.snap) / (r.show - r.snap));
      const recs = r.recs.map((rc) => along(rc.path, p));
      const defs = r.defs.map((d) => {
        const rp = recs[d.rec];
        const k = easeOut(clamp(p * 1.6));
        const sep = d.open ? easeOut(p) : 1;
        return { x: lerp(d.start.x, rp.x + d.ox * sep, k), y: lerp(d.start.y, rp.y + d.oy * sep, k) };
      });
      const sp = easeInOut(p);
      defs.push({ x: lerp(r.safety.start.x, r.safety.end.x, sp), y: lerp(r.safety.start.y, r.safety.end.y, sp) });
      defs.push({ x: lerp(r.mike.start.x, r.mike.end.x, sp), y: lerp(r.mike.start.y, r.mike.end.y, sp) });
      return { recs, defs, p };
    }

    function defAt(d, t) {
      if (d.fake) {
        if (t < 0.9) return { x: lerp(d.start.x, d.fake.x, easeInOut(t / 0.9)), y: lerp(d.start.y, d.fake.y, easeInOut(t / 0.9)) };
        const k = easeInOut((t - 0.9) / 0.7);
        return { x: lerp(d.fake.x, d.end.x, k), y: lerp(d.fake.y, d.end.y, k) };
      }
      const t0 = r.kind === 'shell' && d.role === 'S' ? r.snap : d.blitz ? 0.5 : 0.2;
      const k = easeInOut((t - t0) / 1.0);
      return { x: lerp(d.start.x, d.end.x, k), y: lerp(d.start.y, d.end.y, k) };
    }

    function update(dt) {
      if (!r) return;
      r.t += dt;
      if (r.phase === 'show' && r.t >= r.show) {
        r.phase = 'answer';
        fx.text(W / 2, 300, 'READ IT!', { color: C.gold, size: 30, life: 0.7, rise: 10 });
      } else if (r.phase === 'answer') {
        r.left = Math.max(0, r.left - dt);
        if (r.left <= 0) answer(false, null);
      } else if (r.phase === 'feedback') {
        r.fb += dt;
        if (r.fb > 1.5) next();
      }
      hud.clock(r.phase === 'answer' ? r.left / LIMIT : r.phase === 'show' ? 1 : 0);
    }

    // ---- drawing ----
    function chalkField() {
      ctx.fillStyle = '#1f4a2c';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1.5;
      for (let y = LOS - 300; y < H; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(110,180,255,.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, LOS);
      ctx.lineTo(W, LOS);
      ctx.stroke();
    }
    function drawO(x, y, o = {}) {
      ctx.strokeStyle = o.color || C.o;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, o.r || 9, 0, TAU);
      ctx.stroke();
      if (o.fill) {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
    }
    function drawX(x, y, color = C.x, s = 8) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }
    function ringAt(pt, color, time) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 18 + Math.sin(time * 10) * 2, 0, TAU);
      ctx.stroke();
    }
    function drawOffenseStatic(recs, skip = false) {
      OL.forEach((x) => drawO(x, LOS + 14));
      drawO(QBP.x, QBP.y, { fill: 'rgba(255,200,61,.35)', color: C.gold });
      if (!skip) recs.forEach((rc) => drawO(rc.start.x, rc.start.y));
    }

    function drawRoute(rc, p) {
      const pts = rc.path.pts;
      ctx.strokeStyle = 'rgba(246,241,227,.75)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      let d = rc.path.L * p;
      for (let k = 0; k < rc.path.seg.length && d > 0; k++) {
        const f = Math.min(1, d / rc.path.seg[k]);
        ctx.lineTo(lerp(pts[k].x, pts[k + 1].x, f), lerp(pts[k].y, pts[k + 1].y, f));
        d -= rc.path.seg[k];
      }
      ctx.stroke();
    }

    function drawOpen(time) {
      const st = openState(r.t);
      drawOffenseStatic(r.recs, true);
      r.recs.forEach((rc, k) => drawRoute(rc, st.p));
      st.defs.forEach((d) => drawX(d.x, d.y));
      st.recs.forEach((pt) => drawO(pt.x, pt.y, { fill: 'rgba(31,74,44,.9)' }));
      if (r.phase === 'feedback') {
        const target = st.recs[r.pick ?? r.open];
        ringAt(st.recs[r.open], C.good, time);
        if (r.pick !== null && !r.correct) ringAt(st.recs[r.pick], C.bad, time);
        if (r.pick !== null) {
          const f = clamp(r.fb / 0.5);
          drawBall(ctx, lerp(QBP.x, target.x, f), lerp(QBP.y, target.y, f) - Math.sin(f * Math.PI) * 30, 1.4, -1.2);
        }
      }
      return st;
    }

    function drawDefense(time) {
      drawOffenseStatic(r.recs);
      const pts = r.defs.map((d) => defAt(d, r.t));
      pts.forEach((pt, k) => {
        let p = pt;
        if (r.phase === 'feedback' && r.kind === 'blitz' && k === r.blitzer) {
          const f = easeOut(r.fb / 0.6);
          p = { x: lerp(pt.x, QBP.x, f * 0.85), y: lerp(pt.y, QBP.y, f * 0.85) };
        }
        drawX(p.x, p.y);
      });
      if (r.kind === 'shell' && r.phase === 'feedback') {
        // shade the deep zones for the correct shell
        ctx.fillStyle = 'rgba(94,240,138,.13)';
        if (r.answer === 2) {
          ctx.fillRect(10, 40, 168, 150);
          ctx.fillRect(182, 40, 168, 150);
        } else if (r.answer === 1) ctx.fillRect(80, 40, 200, 150);
        label(ctx, ['COVER 0 — EVERYBODY COMES', 'MIDDLE OF THE FIELD CLOSED', 'TWO-HIGH — MIDDLE IS OPEN'][r.answer], W / 2, 200, { size: 14, color: C.good });
      }
      if (r.kind === 'blitz' && r.phase === 'feedback') {
        ringAt(pts[r.blitzer], C.good, time);
        if (r.pick !== null && !r.correct) ringAt(pts[r.pick], C.bad, time);
      }
      if (r.kind === 'shell' && r.t > r.snap - 0.15 && r.t < r.snap + 0.5) label(ctx, 'HUT!', QBP.x, QBP.y + 34, { size: 18, color: C.gold });
      if (r.kind === 'blitz' && r.phase === 'show') label(ctx, ['', 'BLUE 80…', 'BLUE 80…', 'SET…'][Math.min(3, Math.floor(r.t / 0.5))], QBP.x, QBP.y + 34, { size: 15, color: C.gold });
      return pts;
    }

    function drawButtons() {
      for (const b of BTN) {
        const sel = r.phase === 'feedback' && (b.n === r.answer || b.n === r.pick);
        ctx.fillStyle = sel ? (b.n === r.answer ? 'rgba(94,240,138,.85)' : 'rgba(255,93,93,.85)') : 'rgba(11,20,34,.85)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 12);
        ctx.fill();
        ctx.strokeStyle = r.phase === 'answer' ? C.gold : 'rgba(255,255,255,.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        label(ctx, `${b.n}-HIGH`, b.x + b.w / 2, b.y + b.h / 2, { size: 18, color: sel ? C.ink : '#fff', stroke: false });
      }
    }

    let lastPts = null;
    function draw(time) {
      chalkField();
      label(ctx, r.prompt, W / 2, 26, { size: 20, color: C.gold });
      if (r.kind === 'open') lastPts = drawOpen(time).recs;
      else lastPts = drawDefense(time);
      if (r.kind === 'shell') drawButtons();
      if (r.phase === 'answer') {
        label(ctx, r.left.toFixed(1), W - 30, 26, { size: 18, color: r.left < 1.5 ? C.bad : '#fff' });
        if (r.kind !== 'shell') label(ctx, r.kind === 'open' ? 'TAP THE OPEN RECEIVER' : 'TAP THE BLITZER', W / 2, 560, { size: 15 });
      } else if (r.phase === 'show') {
        label(ctx, r.kind === 'open' ? 'Watch the routes…' : r.kind === 'blitz' ? 'Watch the defense…' : 'Watch the safeties…', W / 2, 560, { size: 14, color: 'rgba(255,255,255,.7)' });
      }
    }

    stage.on(stage.canvas, 'pointerdown', (e) => {
      e.preventDefault();
      if (!r || r.phase !== 'answer' || !lastPts) return;
      const v = stage.toVirtual(e);
      if (r.kind === 'shell') {
        const b = BTN.find((b) => v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y - 8 && v.y <= b.y + b.h + 8);
        if (b) answer(b.n === r.answer, b.n);
        return;
      }
      let best = -1, bd = 40;
      lastPts.forEach((pt, k) => {
        const d = dist(pt, v);
        if (d < bd) { bd = d; best = k; }
      });
      if (best < 0) return;
      if (r.kind === 'open') answer(best === r.open, best);
      else answer(best === r.blitzer, best);
    });
    stage.on(window, 'keydown', (e) => {
      if (r && r.kind === 'shell' && r.phase === 'answer' && ['Digit0', 'Digit1', 'Digit2'].includes(e.code)) {
        const n = Number(e.code.slice(-1));
        answer(n === r.answer, n);
      }
    });

    next();
    stage.loop((dt, time) => {
      update(dt);
      if (!r || i >= reads.length) return;
      fx.update(dt);
      stage.begin();
      draw(time);
      fx.draw(ctx);
      stage.end();
    });
  });
}
