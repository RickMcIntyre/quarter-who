// Challenge 3 — IQ. Five reads on a chalk-style X's-and-O's diagram, drawn from
// seven read types so each day is a different mix:
//   open     — watch routes develop, tap the open receiver
//   blitz    — watch the pre-snap creep (with decoys), tap the blitzer
//   hot      — a cover man blitzes: tap the receiver he left uncovered
//   leverage — corner sets inside or outside: throw SLANT or OUT away from him
//   motion   — send a man in motion: MAN if a defender travels with him, else ZONE
//   box      — count the box vs your blockers: RUN or PASS
//   shell    — safeties rotate at the snap: 0, 1 or 2 high
// Score per read = correct ? 50 + up to 50 speed bonus : 0.
import { createStage, Floaters, clamp, lerp, easeOut, easeInOut, C, TAU, buzz, drawBall, label, roundRect } from './engine.js';

export const meta = {
  id: 'iq',
  title: 'IQ',
  icon: '🧠',
  howTo: [
    'Five reads, a different mix every day: <b>find the open man</b>, <b>spot the blitz</b>, <b>hit the hot route</b>, <b>beat the leverage</b>, <b>man or zone</b>, <b>count the box</b>, <b>read the shell</b>.',
    'Each read tells you what to look for. Watch the play, then answer before the shot clock runs out.',
    'Wrong = 0. Fast and right = 100.',
  ],
};

const W = 360, H = 600;
const LOS = 360;
const OL = [132, 156, 180, 204, 228];
const QBP = { x: 180, y: 420 };

// ---- keyframed movement: [[t, x, y], ...] eased between frames ----
const still = (x, y) => [[0, x, y]];
export function at(kf, t) {
  if (t <= kf[0][0] || kf.length === 1) return { x: kf[0][1], y: kf[0][2] };
  for (let k = 0; k < kf.length - 1; k++) {
    const [t0, x0, y0] = kf[k], [t1, x1, y1] = kf[k + 1];
    if (t <= t1) {
      const f = easeInOut((t - t0) / (t1 - t0));
      return { x: lerp(x0, x1, f), y: lerp(y0, y1, f) };
    }
  }
  const last = kf[kf.length - 1];
  return { x: last[1], y: last[2] };
}
const jit = (rng, kf, n = 5) => kf.concat([[kf[kf.length - 1][0] + 1.2, kf[kf.length - 1][1] + rng.range(-n, n), kf[kf.length - 1][2] + rng.range(-n, n)]]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------- OPEN MAN (routes) ----------------
const FORMS = [
  [{ x: 30, y: LOS + 8 }, { x: 92, y: LOS + 14 }, { x: 268, y: LOS + 14 }, { x: 330, y: LOS + 8 }],
  [{ x: 30, y: LOS + 8 }, { x: 250, y: LOS + 14 }, { x: 292, y: LOS + 14 }, { x: 330, y: LOS + 8 }],
  [{ x: 30, y: LOS + 8 }, { x: 92, y: LOS + 14 }, { x: 330, y: LOS + 8 }, { x: 212, y: QBP.y, rb: true }],
  [{ x: 26, y: LOS + 8 }, { x: 62, y: LOS + 14 }, { x: 98, y: LOS + 14 }, { x: 330, y: LOS + 8 }, { x: 212, y: QBP.y, rb: true }],
];
const ROUTES = {
  go: [[0, -230]],
  slant: [[0, -28], [80, -100]],
  out: [[0, -110], [-55, -110]],
  dig: [[0, -130], [120, -130]],
  post: [[0, -120], [70, -215]],
  curl: [[0, -135], [12, -115]],
  corner: [[0, -110], [-60, -190]],
  seam: [[6, -205]],
  whip: [[0, -60], [40, -70], [0, -60]],
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

function makeOpen(rng) {
  const form = FORMS[rng.int(0, FORMS.length - 1)];
  const names = Object.keys(ROUTES);
  const recs = form.map((s) => {
    const rb = !!s.rb;
    const name = rb ? rng.pick(Object.keys(RB_ROUTES)) : rng.pick(names);
    return { start: s, rb, path: buildPath(s, rb ? RB_ROUTES[name] : ROUTES[name], rb) };
  });
  const open = rng.int(0, recs.length - 1);
  const ends = recs.map((r) => r.path.pts[r.path.pts.length - 1]);
  const defs = recs.map((r, k) => {
    const wide = r.start.x < 60 || r.start.x > 300;
    const start = { x: r.start.x + rng.range(-8, 8), y: r.rb ? LOS - 44 : wide ? LOS - 66 : LOS - 48 };
    let ox = 0, oy = 0;
    for (let tries = 0; tries < 14; tries++) {
      const ang = rng.range(0, TAU);
      const off = k === open ? rng.range(44, 58) : rng.range(7, 13);
      ox = Math.cos(ang) * off;
      oy = Math.sin(ang) * off;
      const e = { x: ends[k].x + ox, y: ends[k].y + oy };
      const inBounds = e.x > 14 && e.x < 346 && e.y > 40 && e.y < LOS + 20;
      const clear = k !== open || ends.every((o, j) => j === k || dist(o, e) > 40);
      if (inBounds && clear) break;
    }
    return { start, ox, oy, rec: k, open: k === open };
  });
  let deep = -1;
  ends.forEach((e, k) => { if (k !== open && (deep < 0 || e.y < ends[deep].y)) deep = k; });
  const safety = { start: { x: 180 + rng.range(-20, 20), y: 150 }, end: { x: ends[deep].x + rng.range(-10, 10), y: Math.max(44, ends[deep].y - 24) } };
  // a robber lurks underneath toward the open man's side to muddy the picture
  const oe = ends[open];
  const mike = { start: { x: 180, y: LOS - 50 }, end: { x: lerp(180, oe.x, 0.4) + rng.range(-20, 20), y: clamp(lerp(LOS - 100, oe.y, 0.3), 60, LOS - 40) } };
  return { kind: 'open', prompt: 'FIND THE OPEN MAN', sub: 'Most space wins', recs, defs, open, safety, mike, snap: 0.45, show: 2.1, target: 'route' };
}

// ---------------- shared pre-snap pictures ----------------
const WIDE = [30, 330], SLOT = [92, 268];
const twoByTwo = () => [still(WIDE[0], LOS + 8), still(SLOT[0], LOS + 14), still(SLOT[1], LOS + 14), still(WIDE[1], LOS + 8)];
const DL = [142, 168, 194, 220];

function dlLine(rng) {
  return DL.map((x) => ({ kf: jit(rng, still(x + rng.range(-3, 3), LOS - 14), 3) }));
}

function makeBlitz(rng) {
  const base = [
    { x: 122, y: LOS - 56 }, { x: 180, y: LOS - 62 }, { x: 238, y: LOS - 56 },
    { x: 32, y: LOS - 62 }, { x: 328, y: LOS - 62 },
    { x: 112, y: LOS - 170 }, { x: 248, y: LOS - 170 },
  ].map((p) => ({ x: p.x + rng.range(-5, 5), y: p.y + rng.range(-5, 5) }));
  const ends = [
    { x: rng.pick([155, 181]), y: LOS - 26 }, { x: rng.pick([181, 207]), y: LOS - 26 }, { x: rng.pick([181, 207]), y: LOS - 26 },
    { x: 84, y: LOS - 28 }, { x: 276, y: LOS - 28 },
    { x: 126, y: LOS - 44 }, { x: 234, y: LOS - 44 },
  ];
  const order = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
  const [b, d1, d2] = order;
  const defs = dlLine(rng).concat(base.map((p, k) => {
    let kf;
    if (k === b) kf = [[0, p.x, p.y], [0.55, p.x, p.y], [1.6, ends[k].x, ends[k].y]];
    else if (k === d1) {
      // shows blitz early, bails out
      const f = { x: lerp(p.x, ends[k].x, 0.7), y: lerp(p.y, ends[k].y, 0.7) };
      kf = [[0, p.x, p.y], [0.2, p.x, p.y], [0.8, f.x, f.y], [1.5, p.x + rng.range(-6, 6), p.y - 10]];
    } else if (k === d2) {
      // creeps halfway and sits — a sugar look
      const f = { x: lerp(p.x, ends[k].x, 0.45), y: lerp(p.y, ends[k].y, 0.45) };
      kf = [[0, p.x, p.y], [0.4, p.x, p.y], [1.3, f.x, f.y]];
    } else kf = jit(rng, still(p.x, p.y));
    return { kf };
  }));
  return { kind: 'blitz', prompt: "WHO'S BLITZING?", sub: 'Tap the defender coming after you', recs: twoByTwo(), defs, answer: 4 + b, rusher: 4 + b, show: 1.9, target: 'def' };
}

function makeHot(rng) {
  // cover men line up over each receiver; one of them blitzes and leaves his man alone
  const cover = [
    { x: WIDE[0] + 2, y: LOS - 60 }, { x: SLOT[0], y: LOS - 46 }, { x: SLOT[1], y: LOS - 46 }, { x: WIDE[1] - 2, y: LOS - 60 },
  ].map((p) => ({ x: p.x + rng.range(-5, 5), y: p.y + rng.range(-5, 5) }));
  const blitzEnd = [{ x: 96, y: LOS - 22 }, { x: 124, y: LOS - 22 }, { x: 236, y: LOS - 22 }, { x: 264, y: LOS - 22 }];
  const b = rng.int(0, 3);
  const decoy = rng.pick([0, 1, 2, 3].filter((k) => k !== b));
  const defs = dlLine(rng);
  defs.push({ kf: jit(rng, still(180, LOS - 62)) });
  cover.forEach((p, k) => {
    let kf;
    if (k === b) kf = [[0, p.x, p.y], [0.5, p.x, p.y], [1.5, blitzEnd[k].x, blitzEnd[k].y]];
    else if (k === decoy) kf = [[0, p.x, p.y], [0.3, p.x, p.y], [0.9, lerp(p.x, blitzEnd[k].x, 0.6), lerp(p.y, blitzEnd[k].y, 0.6)], [1.6, p.x, p.y - 4]];
    else kf = jit(rng, still(p.x, p.y));
    defs.push({ kf });
  });
  defs.push({ kf: jit(rng, still(112 + rng.range(-8, 8), LOS - 175)) });
  defs.push({ kf: jit(rng, still(248 + rng.range(-8, 8), LOS - 175)) });
  return { kind: 'hot', prompt: 'HOT ROUTE!', sub: 'A cover man is blitzing — tap the receiver he left open', recs: twoByTwo(), defs, answer: b, rusher: 5 + b, show: 1.8, target: 'rec' };
}

function makeLeverage(rng) {
  const side = rng.int(0, 1); // 0 = left wide receiver, 1 = right
  const rx = WIDE[side];
  const inward = side === 0 ? 1 : -1;
  const inside = rng.chance(0.5);
  const endX = rx + inward * (inside ? 13 : -13);
  const startX = rx + inward * (rng.chance(0.6) ? (inside ? -13 : 13) : (inside ? 13 : -13)); // often starts on the wrong side
  const defs = dlLine(rng).concat([
    { kf: jit(rng, still(122, LOS - 56)) }, { kf: jit(rng, still(180, LOS - 62)) }, { kf: jit(rng, still(238, LOS - 56)) },
    { kf: [[0, startX, LOS - 52], [0.7, startX, LOS - 52], [1.45, endX, LOS - 40]] },
    { kf: jit(rng, still(WIDE[1 - side] + (side === 0 ? -4 : 4), LOS - 62)) },
    { kf: jit(rng, still(112, LOS - 170)) }, { kf: jit(rng, still(248, LOS - 170)) },
  ]);
  const recs = [still(WIDE[0], LOS + 8), still(SLOT[0], LOS + 14), still(SLOT[1], LOS + 14), still(WIDE[1], LOS + 8)];
  return {
    kind: 'leverage', prompt: 'BEAT THE LEVERAGE', sub: 'Throw away from where the corner sets', recs, defs, iso: side === 0 ? 0 : 3, inward,
    buttons: ['SLANT', 'OUT'], answer: inside ? 'OUT' : 'SLANT', why: inside ? 'Inside leverage → throw OUT' : 'Outside leverage → throw SLANT', show: 1.7, target: 'btn',
  };
}

function makeMotion(rng) {
  const man = rng.chance(0.5);
  const fromLeft = rng.chance(0.5);
  const sx = fromLeft ? SLOT[0] : SLOT[1];
  const ex = fromLeft ? 236 : 124;
  const recs = [still(WIDE[0], LOS + 8), [[0, sx, LOS + 14], [0.35, sx, LOS + 14], [1.55, ex, LOS + 14]], still(fromLeft ? SLOT[1] : SLOT[0], LOS + 14), still(WIDE[1], LOS + 8)];
  // order recs left→right isn't needed; index 1 is the motion man
  const nickel = man
    ? [[0, sx, LOS - 48], [0.5, sx, LOS - 48], [1.75, ex + (fromLeft ? -8 : 8), LOS - 46]]
    : [[0, sx, LOS - 48], [0.7, sx, LOS - 48], [1.3, sx + (fromLeft ? 14 : -14), LOS - 56]];
  // in zone the defense "bumps": linebackers slide a step and a safety rotates; in man they barely move
  const bump = man ? 2 : 1;
  const lbShift = man ? 0 : fromLeft ? 16 : -16;
  const defs = dlLine(rng).concat([
    { kf: [[0, 122, LOS - 56], [0.8, 122, LOS - 56], [1.5, 122 + lbShift * bump * 0.5 + rng.range(-3, 3), LOS - 56]] },
    { kf: [[0, 180, LOS - 62], [0.8, 180, LOS - 62], [1.5, 180 + lbShift + rng.range(-3, 3), LOS - 60]] },
    { kf: nickel },
    { kf: jit(rng, still(32, LOS - 62)) }, { kf: jit(rng, still(328, LOS - 62)) },
    { kf: man ? jit(rng, still(112, LOS - 170)) : [[0, 112, LOS - 170], [0.9, 112, LOS - 170], [1.6, 112 + lbShift * 1.5, LOS - 160]] },
    { kf: man ? jit(rng, still(248, LOS - 170)) : [[0, 248, LOS - 170], [0.9, 248, LOS - 170], [1.6, 248 + lbShift * 1.5, LOS - 180]] },
  ]);
  return { kind: 'motion', prompt: 'MAN OR ZONE?', sub: 'Watch who travels with the motion man', recs, defs, motion: 1, buttons: ['MAN', 'ZONE'], answer: man ? 'MAN' : 'ZONE', why: man ? 'He followed the motion → MAN' : 'Nobody followed — they bumped → ZONE', show: 1.85, target: 'btn' };
}

const BOX = { x0: 108, x1: 252, y0: LOS - 105, y1: LOS - 4 };
const inBox = (p) => p.x >= BOX.x0 && p.x <= BOX.x1 && p.y >= BOX.y0 && p.y <= BOX.y1;

function makeBox(rng) {
  const te = rng.chance(0.5);
  const blockers = 5 + (te ? 1 : 0);
  const n = blockers + rng.pick([-1, 0, 1, 1, 2]); // defenders in the box
  const walk = n > 5 && rng.chance(0.6); // last one in walks down late from safety depth
  const boxSpots = rng.shuffle([{ x: 122, y: LOS - 56 }, { x: 180, y: LOS - 62 }, { x: 238, y: LOS - 56 }, { x: 150, y: LOS - 82 }, { x: 214, y: LOS - 84 }]);
  const defs = dlLine(rng);
  const inside = n - 4;
  for (let k = 0; k < inside; k++) {
    const p = boxSpots[k];
    if (walk && k === inside - 1) defs.push({ kf: [[0, p.x + 20, LOS - 175], [0.7, p.x + 20, LOS - 175], [1.6, p.x, p.y]] });
    else defs.push({ kf: jit(rng, still(p.x + rng.range(-4, 4), p.y + rng.range(-4, 4))) });
  }
  const outside = [{ x: 32, y: LOS - 62 }, { x: 328, y: LOS - 62 }, { x: 112, y: LOS - 175 }, { x: 248, y: LOS - 175 }, { x: 72, y: LOS - 52 }, { x: 290, y: LOS - 52 }, { x: 180, y: LOS - 205 }];
  // if a safety walked down, the deep spot it left is already gone from the outside list
  const out = walk ? outside.filter((_, k) => k !== 3) : outside;
  for (let k = 0; k < 11 - n; k++) defs.push({ kf: jit(rng, still(out[k].x + rng.range(-4, 4), out[k].y + rng.range(-4, 4))) });
  const recs = [still(WIDE[0], LOS + 8), still(WIDE[1], LOS + 8)];
  if (te) recs.push(still(252, LOS + 14));
  else recs.push(still(SLOT[1], LOS + 14));
  return {
    kind: 'box', prompt: 'RUN OR PASS?', sub: `You have ${blockers} blockers. More in the box than that → throw it`, recs, defs, te, rb: true, boxN: n, blockers,
    buttons: ['RUN', 'PASS'], answer: n > blockers ? 'PASS' : 'RUN', why: `${n} in the box vs ${blockers} blockers → ${n > blockers ? 'PASS' : 'RUN'}`, show: 1.8, target: 'btn',
  };
}

function shellSpots(n, side) {
  if (n === 2) return [{ x: 100, y: LOS - 178 }, { x: 260, y: LOS - 178 }];
  if (n === 1) return side ? [{ x: 182, y: LOS - 210 }, { x: 252, y: LOS - 70 }] : [{ x: 108, y: LOS - 70 }, { x: 178, y: LOS - 210 }];
  return [{ x: 134, y: LOS - 52 }, { x: 228, y: LOS - 52 }];
}

function makeShell(rng) {
  const answer = rng.int(0, 2);
  const startN = rng.chance(0.15) ? answer : rng.pick([0, 1, 2].filter((n) => n !== answer));
  const from = shellSpots(startN, rng.chance(0.5));
  const to = shellSpots(answer, rng.chance(0.5));
  const snap = 0.9;
  const defs = dlLine(rng).concat([
    { kf: jit(rng, still(122, LOS - 56)) }, { kf: jit(rng, still(180, LOS - 62)) }, { kf: jit(rng, still(238, LOS - 56)) },
  ]);
  for (const x of [32, 328]) {
    const end = answer === 0 ? { x: x < 180 ? 36 : 324, y: LOS - 22 } : answer === 2 ? { x, y: LOS - 80 } : { x, y: LOS - 62 };
    defs.push({ kf: [[0, x, LOS - 62], [snap, x, LOS - 62], [1.8, end.x, end.y]] });
  }
  [0, 1].forEach((k) => defs.push({ kf: [[0, from[k].x + rng.range(-6, 6), from[k].y + rng.range(-6, 6)], [snap, from[k].x, from[k].y], [1.8, to[k].x, to[k].y]] }));
  return { kind: 'shell', prompt: 'READ THE SHELL', sub: 'How many deep safeties AFTER the snap?', recs: twoByTwo(), defs, snap, buttons: ['0-HIGH', '1-HIGH', '2-HIGH'], answer: `${answer}-HIGH`, shellN: answer, why: ['Cover 0 — everybody comes', 'One high — middle of the field closed', 'Two high — middle of the field open'][answer], show: 2.0, target: 'btn' };
}

export const MAKERS = { open: makeOpen, blitz: makeBlitz, hot: makeHot, leverage: makeLeverage, motion: makeMotion, box: makeBox, shell: makeShell };
export const READ_TYPES = Object.keys(MAKERS);

function buttonRects(labels) {
  const n = labels.length, gap = 12, w = (324 - gap * (n - 1)) / n;
  return labels.map((l, k) => ({ l, x: 18 + k * (w + gap), y: 516, w, h: 50 }));
}

export function run({ host, rng, build, hud }) {
  return new Promise((resolve) => {
    const stage = createStage(host, W, H);
    const { ctx } = stage;
    const fx = new Floaters();
    const hN = clamp((build.height - 70) / 8);
    const LIMIT = 4.6 + hN * 0.6; // taller QBs see over the line: a touch more time
    // five different read types per day out of seven
    const kinds = rng.shuffle(READ_TYPES).slice(0, 5);
    const reads = kinds.map((k) => MAKERS[k](rng));
    const scores = [];
    let i = -1, r = null, lastTargets = [];

    function next() {
      i++;
      if (i >= reads.length) {
        stage.destroy();
        resolve({ score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), detail: scores });
        return;
      }
      r = { ...reads[i], t: 0, phase: 'show', left: LIMIT, pick: null, correct: false, fb: 0 };
      if (r.buttons) r.btns = buttonRects(r.buttons);
      hud.status(`Read ${i + 1} of 5`);
      hud.pips(scores, reads.length);
    }

    function answer(pick) {
      if (r.phase !== 'answer') return;
      const correct = pick !== null && pick === (r.kind === 'open' ? r.open : r.answer);
      r.phase = 'feedback';
      r.pick = pick;
      r.correct = correct;
      const s = correct ? Math.round(50 + 50 * Math.min(1, r.left / (LIMIT * 0.75))) : 0;
      scores.push(s);
      hud.pips(scores, reads.length);
      fx.text(W / 2, 470, correct ? (s >= 85 ? 'INSTANT READ!' : 'GOOD READ') : pick === null ? 'TOO SLOW' : 'WRONG READ', { color: correct ? C.good : C.bad, size: 26, life: 1.4 });
      fx.text(W / 2, 500, `+${s}`, { size: 18, life: 1.4 });
      buzz(correct ? 15 : [30, 30, 30]);
      if (!correct) stage.shake(0.5);
    }

    function update(dt) {
      if (!r) return;
      r.t += dt;
      if (r.phase === 'show' && r.t >= r.show) {
        r.phase = 'answer';
        fx.text(W / 2, 300, 'READ IT!', { color: C.gold, size: 30, life: 0.7, rise: 10 });
      } else if (r.phase === 'answer') {
        r.left = Math.max(0, r.left - dt);
        if (r.left <= 0) answer(null);
      } else if (r.phase === 'feedback') {
        r.fb += dt;
        if (r.fb > 1.7) next();
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
      if (o.fill) {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      ctx.stroke();
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
    function line(pts, color, dash = []) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawOpen(time) {
      const p = clamp((r.t - r.snap) / (r.show - r.snap));
      OL.forEach((x) => drawO(x, LOS + 14));
      drawO(QBP.x, QBP.y, { fill: 'rgba(255,200,61,.35)', color: C.gold });
      const recs = r.recs.map((rc) => along(rc.path, p));
      r.recs.forEach((rc) => {
        // route traced so far
        const pts = [rc.path.pts[0]];
        let d = rc.path.L * p;
        for (let k = 0; k < rc.path.seg.length && d > 0; k++) {
          const f = Math.min(1, d / rc.path.seg[k]);
          pts.push({ x: lerp(rc.path.pts[k].x, rc.path.pts[k + 1].x, f), y: lerp(rc.path.pts[k].y, rc.path.pts[k + 1].y, f) });
          d -= rc.path.seg[k];
        }
        line(pts, 'rgba(246,241,227,.75)');
      });
      const defs = r.defs.map((d) => {
        const rp = recs[d.rec];
        const k = easeOut(clamp(p * 1.6));
        const sep = d.open ? easeOut(p) : 1;
        return { x: lerp(d.start.x, rp.x + d.ox * sep, k), y: lerp(d.start.y, rp.y + d.oy * sep, k) };
      });
      const sp = easeInOut(p);
      defs.push({ x: lerp(r.safety.start.x, r.safety.end.x, sp), y: lerp(r.safety.start.y, r.safety.end.y, sp) });
      defs.push({ x: lerp(r.mike.start.x, r.mike.end.x, sp), y: lerp(r.mike.start.y, r.mike.end.y, sp) });
      defs.forEach((d) => drawX(d.x, d.y));
      recs.forEach((pt) => drawO(pt.x, pt.y, { fill: 'rgba(31,74,44,.9)' }));
      if (r.phase === 'feedback') {
        ringAt(recs[r.open], C.good, time);
        if (r.pick !== null && !r.correct) ringAt(recs[r.pick], C.bad, time);
        if (r.pick !== null) {
          const tgt = recs[r.pick];
          const f = clamp(r.fb / 0.5);
          drawBall(ctx, lerp(QBP.x, tgt.x, f), lerp(QBP.y, tgt.y, f) - Math.sin(f * Math.PI) * 30, 1.4, -1.2);
        }
      }
      return recs;
    }

    function drawPicture(time) {
      const t = r.t;
      if (r.kind === 'box') {
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.fillRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);
        ctx.setLineDash([]);
        label(ctx, 'THE BOX', BOX.x0 + 34, BOX.y0 - 10, { size: 11, color: 'rgba(255,255,255,.6)', stroke: false });
      }
      // offense
      OL.forEach((x) => drawO(x, LOS + 14, { color: r.kind === 'box' ? C.gold : C.o }));
      if (r.kind === 'box' && r.te) drawO(252, LOS + 14, { color: C.gold });
      drawO(QBP.x, QBP.y, { fill: 'rgba(255,200,61,.35)', color: C.gold });
      if (r.rb) drawO(QBP.x, QBP.y + 30);
      const recs = r.recs.map((kf) => at(kf, t));
      recs.forEach((p, k) => {
        if (r.kind === 'box' && r.te && k === recs.length - 1) return; // TE drawn as a blocker
        drawO(p.x, p.y, { fill: r.target === 'rec' ? 'rgba(255,255,255,.15)' : null });
      });
      if (r.kind === 'leverage') {
        const p = recs[r.iso];
        ringAt(p, 'rgba(255,200,61,.8)', time);
        const slant = [p, { x: p.x, y: p.y - 26 }, { x: p.x + r.inward * 70, y: p.y - 90 }];
        const out = [p, { x: p.x, y: p.y - 80 }, { x: p.x - r.inward * 40, y: p.y - 80 }].map((q) => ({ x: clamp(q.x, 8, 352), y: q.y }));
        line(slant, 'rgba(255,255,255,.35)', [5, 5]);
        line(out, 'rgba(255,255,255,.35)', [5, 5]);
        label(ctx, 'SLANT', p.x + r.inward * 70, p.y - 104, { size: 11, color: 'rgba(255,255,255,.7)', stroke: false });
        label(ctx, 'OUT', clamp(p.x - r.inward * 22, 20, 340), p.y - 94, { size: 11, color: 'rgba(255,255,255,.7)', stroke: false });
      }
      if (r.kind === 'motion' && t < r.show) {
        const p = recs[r.motion];
        ctx.fillStyle = 'rgba(255,200,61,.8)';
        label(ctx, 'MOTION', p.x, p.y + 22, { size: 10, color: C.gold, stroke: false });
      }
      // defense
      const defs = r.defs.map((d) => at(d.kf, t));
      defs.forEach((p, k) => {
        let q = p;
        if (r.phase === 'feedback' && r.rusher === k) {
          const f = easeOut(r.fb / 0.6);
          q = { x: lerp(p.x, QBP.x, f * 0.85), y: lerp(p.y, QBP.y, f * 0.85) };
        }
        drawX(q.x, q.y, r.phase === 'feedback' && r.kind === 'box' && inBox(p) ? '#ffb347' : C.x);
      });
      // feedback overlays
      if (r.phase === 'feedback') {
        if (r.kind === 'blitz') {
          ringAt(defs[r.answer], C.good, time);
          if (r.pick !== null && !r.correct) ringAt(defs[r.pick], C.bad, time);
        }
        if (r.kind === 'hot') {
          ringAt(recs[r.answer], C.good, time);
          if (r.pick !== null && !r.correct) ringAt(recs[r.pick], C.bad, time);
          const tgt = recs[r.answer], f = clamp(r.fb / 0.4);
          drawBall(ctx, lerp(QBP.x, tgt.x, f), lerp(QBP.y, tgt.y, f) - Math.sin(f * Math.PI) * 20, 1.3, -1.2);
        }
        if (r.kind === 'shell') {
          ctx.fillStyle = 'rgba(94,240,138,.13)';
          if (r.shellN === 2) {
            ctx.fillRect(10, 40, 168, 150);
            ctx.fillRect(182, 40, 168, 150);
          } else if (r.shellN === 1) ctx.fillRect(80, 40, 200, 150);
        }
        if (r.why) label(ctx, r.why, W / 2, 210, { size: 14, color: r.correct ? C.good : '#ffd27a' });
      }
      if (r.kind === 'shell' && t > r.snap - 0.15 && t < r.snap + 0.5) label(ctx, 'HUT!', QBP.x, QBP.y + 34, { size: 18, color: C.gold });
      if ((r.kind === 'blitz' || r.kind === 'hot') && r.phase === 'show') label(ctx, ['', 'BLUE 80…', 'BLUE 80…', 'SET…'][Math.min(3, Math.floor(t / 0.5))], QBP.x, QBP.y + 36, { size: 15, color: C.gold });
      return r.target === 'rec' ? recs : r.target === 'def' ? defs : [];
    }

    function drawButtons() {
      for (const b of r.btns) {
        const isAns = b.l === r.answer, isPick = b.l === r.pick;
        const lit = r.phase === 'feedback' && (isAns || isPick);
        ctx.fillStyle = lit ? (isAns ? 'rgba(94,240,138,.9)' : 'rgba(255,93,93,.9)') : 'rgba(11,20,34,.85)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 12);
        ctx.fill();
        ctx.strokeStyle = r.phase === 'answer' ? C.gold : 'rgba(255,255,255,.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        label(ctx, b.l, b.x + b.w / 2, b.y + b.h / 2, { size: 18, color: lit ? C.ink : '#fff', stroke: false });
      }
    }

    function draw(time) {
      chalkField();
      label(ctx, r.prompt, W / 2, 24, { size: 20, color: C.gold });
      label(ctx, r.sub, W / 2, 48, { size: 12, color: 'rgba(255,255,255,.75)', weight: 600, stroke: false });
      lastTargets = r.kind === 'open' ? drawOpen(time) : drawPicture(time);
      if (r.btns) drawButtons();
      if (r.phase === 'answer') {
        label(ctx, r.left.toFixed(1), W - 26, 24, { size: 18, color: r.left < 1.5 ? C.bad : '#fff' });
        if (!r.btns) label(ctx, r.kind === 'blitz' ? 'TAP THE BLITZER' : 'TAP THE RECEIVER', W / 2, 560, { size: 15 });
      } else if (r.phase === 'show') {
        label(ctx, 'Watch…', W / 2, 560, { size: 14, color: 'rgba(255,255,255,.7)' });
      }
    }

    stage.on(stage.canvas, 'pointerdown', (e) => {
      e.preventDefault();
      if (!r || r.phase !== 'answer') return;
      const v = stage.toVirtual(e);
      if (r.btns) {
        const b = r.btns.find((b) => v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y - 8 && v.y <= b.y + b.h + 8);
        if (b) answer(b.l);
        return;
      }
      let best = -1, bd = 40;
      lastTargets.forEach((pt, k) => {
        const d = dist(pt, v);
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) answer(best);
    });
    stage.on(window, 'keydown', (e) => {
      if (!r || r.phase !== 'answer' || !r.btns) return;
      const n = Number(e.key) - 1;
      if (n >= 0 && n < r.btns.length) answer(r.btns[n].l);
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
