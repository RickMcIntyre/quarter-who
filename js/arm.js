// Challenge 1 — ARM. Five throws: tight-window timing throws (top-down) and
// deep balls (tap a spot to lead the receiver on his route). Returns 0–100.
import { createStage, Floaters, clamp, lerp, easeOut, C, TAU, buzz, topPlayer, drawBall, drawTurfTop, label } from './engine.js';

export const meta = {
  id: 'arm',
  title: 'Arm',
  icon: '🎯',
  howTo: [
    '<b>Tight window</b> — tap when your receiver crosses the <b>THROW</b> line. The ball meets him in the glowing window.',
    '<b>Deep ball</b> — the route is drawn for you. Tap the spot where your receiver will be when the ball comes down. Lead him: deep balls hang, and the corner is a step behind.',
  ],
};

const W = 360, H = 600;
// Tight-window (top-down) tuning
const QB = { x: 180, y: 532 };
const BALL_SPEED = 560;   // px/s
const CATCH_R = 20;       // receiver offset that still counts as a catch
// Deep-ball tuning
const DEEP_SNAP = 0.6;        // s before the receiver releases
const DEEP_BALL_SPEED = 380;  // px/s on top of a 0.55s base hang time
const DEEP_CATCH_R = 26;      // landing spot within this of the receiver = catch
// waypoints are offsets from the receiver's start; +dx = toward the middle
const DEEP_ROUTES = {
  go: [[0, -420]],
  post: [[0, -170], [110, -400]],
  corner: [[0, -170], [-80, -360]],
  fade: [[-24, -420]],
  'out-and-up': [[0, -110], [-40, -130], [-40, -420]],
};

export function makeTight(rng) {
  return {
    kind: 'tight',
    tx: rng.range(110, 250),
    ty: rng.range(175, 300),
    fromLeft: rng.chance(0.5),
    speed: rng.range(72, 102),
    gap: rng.range(84, 104),
    delay: rng.range(0.35, 0.9),
  };
}

export function makeDeep(rng) {
  const left = rng.chance(0.5);
  const inside = left ? 1 : -1;
  const start = { x: left ? rng.range(36, 70) : rng.range(290, 324), y: 478 };
  const routeName = rng.pick(Object.keys(DEEP_ROUTES));
  const pts = [start, ...DEEP_ROUTES[routeName].map(([dx, dy]) => ({ x: clamp(start.x + dx * inside, 22, 338), y: Math.max(40, start.y + dy) }))];
  const seg = [];
  let L = 0;
  for (let k = 1; k < pts.length; k++) {
    seg.push(Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    L += seg[seg.length - 1];
  }
  return {
    kind: 'deep',
    routeName,
    inside,
    path: { pts, seg, L },
    speed: rng.range(120, 145),
    lag: rng.range(22, 36),            // how far the corner trails
    safety0: { x: 180 + rng.range(-40, 40), y: rng.range(90, 130) },
    safetySpeed: rng.range(45, 70),
  };
}

const rxAt = (p, t) => {
  const e = t - p.delay;
  return p.fromLeft ? -24 + p.speed * e : W + 24 - p.speed * e;
};

export function run({ host, rng, hud }) {
  return new Promise((resolve) => {
    const stage = createStage(host, W, H);
    const { ctx } = stage;
    const fx = new Floaters();
    const plays = rng.shuffle(['tight', 'tight', 'tight', 'deep', 'deep']).map((k) => (k === 'tight' ? makeTight(rng) : makeDeep(rng)));
    const scores = [];
    let i = -1;
    let p = null;
    let clock = 0;
    let firstDeep = true;

    function next() {
      i++;
      if (i >= plays.length) return finish();
      p = { ...plays[i], t: 0, phase: 'play', ball: null, resT: 0, out: null };
      if (p.kind === 'deep') p.safetyPos = { ...p.safety0 };
      hud.status(`Throw ${i + 1} of 5 · ${p.kind === 'tight' ? 'Tight window' : 'Deep ball'}`);
      hud.pips(scores, plays.length);
    }

    function settle(score, text, color) {
      score = Math.round(clamp(score, 0, 100));
      p.phase = 'result';
      p.resT = 0;
      scores.push(score);
      hud.pips(scores, plays.length);
      const at = p.kind === 'tight' ? { x: p.tx, y: p.ty - 34 } : { x: clamp(p.ball ? p.ball.to.x : W / 2, 70, 290), y: clamp(p.ball ? p.ball.to.y - 40 : 200, 60, 400) };
      fx.text(at.x, at.y, text, { color, size: 26 });
      fx.text(at.x, at.y + 30, `+${score}`, { color: '#fff', size: 18, life: 1.2 });
      if (score >= 70) {
        fx.burst(at.x, at.y + 30, C.gold, 18);
        buzz(20);
      } else if (score === 0) {
        stage.shake(0.8);
        buzz([30, 40, 30]);
      }
    }

    function finish() {
      stage.destroy();
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      resolve({ score: Math.round(avg), detail: scores });
    }

    // ---------- tight window ----------
    function throwTight() {
      if (p.phase !== 'play' || p.t < p.delay) return;
      const dist = Math.hypot(p.tx - QB.x, p.ty - QB.y);
      p.ball = { t: 0, dur: dist / BALL_SPEED };
      p.phase = 'flight';
      buzz(10);
    }

    function updateTight(dt) {
      p.t += dt;
      const rx = rxAt(p, p.t);
      if (p.phase === 'play') {
        const gone = p.fromLeft ? rx > W + 30 : rx < -30;
        clock = 1 - clamp((p.t - p.delay) / ((W + 60) / p.speed));
        if (gone) settle(0, 'SACKED', C.bad);
      } else if (p.phase === 'flight') {
        p.ball.t += dt;
        if (p.ball.t >= p.ball.dur) {
          const dx = Math.abs(rx - p.tx);
          const half = p.gap / 2;
          if (dx <= CATCH_R) {
            p.out = 'catch';
            settle(100 - dx * 1.5, dx < 6 ? 'DIME!' : 'COMPLETE', dx < 6 ? C.gold : C.good);
          } else if (dx < half) {
            p.out = 'inc';
            const ahead = p.fromLeft ? rx > p.tx : rx < p.tx;
            settle(50 * (1 - (dx - CATCH_R) / (half - CATCH_R)), ahead ? 'LATE' : 'EARLY', '#ffd27a');
          } else {
            p.out = 'int';
            p.intSide = rx < p.tx ? 1 : -1; // defender on the far side of the receiver jumps it
            settle(0, 'PICKED!', C.bad);
          }
        }
      } else {
        p.resT += dt;
        if (p.resT > 1.25) next();
      }
    }

    function drawTight(time) {
      drawTurfTop(ctx, W, H, 0, 60);
      const half = p.gap / 2;
      const sway = Math.sin(time * 3) * 3;
      // line of scrimmage + OL
      ctx.strokeStyle = 'rgba(90,170,255,.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 488);
      ctx.lineTo(W, 488);
      ctx.stroke();
      for (let k = 0; k < 5; k++) topPlayer(ctx, 132 + k * 24, 500, { s: 0.85 });
      for (let k = 0; k < 4; k++) topPlayer(ctx, 144 + k * 24 + Math.sin(time * 6 + k) * 2, 474, { body: C.x, helmet: C.xHelmet, rot: Math.PI, s: 0.85 });
      // window glow
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.fillStyle = `rgba(255,200,61,${0.12 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(p.tx, p.ty, half - 6, 16, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,200,61,${0.5 + pulse * 0.4})`;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.stroke();
      // aim line
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.moveTo(QB.x, QB.y - 10);
      ctx.lineTo(p.tx, p.ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // defenders bracketing the window
      const rx = rxAt(p, p.t);
      const after = p.phase !== 'play' && p.phase !== 'flight' ? p.resT : 0;
      for (const side of [-1, 1]) {
        let dx = p.tx + side * (half + 6) + sway * side;
        let dy = p.ty - 6;
        if (p.out === 'int' && side === p.intSide) {
          const k = easeOut(after * 3);
          dx = lerp(dx, p.tx, k);
          dy = lerp(dy, p.ty, k) + after * 90;
        } else if (p.out === 'catch' || p.out === 'inc') {
          dx = lerp(dx, rx, clamp(after * 1.5) * 0.7);
        }
        topPlayer(ctx, dx, dy, { body: C.x, helmet: C.xHelmet, rot: Math.PI + Math.atan2(rx - dx, 60) * 0.4 });
        if (p.out === 'int' && side === p.intSide && after > 0) drawBall(ctx, dx + 8, dy - 4, 1.1, 0.3);
      }
      // receiver + trail
      if (p.t > p.delay) {
        const dir = p.fromLeft ? 1 : -1;
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rx - dir * 40, p.ty);
        ctx.lineTo(rx - dir * 14, p.ty);
        ctx.stroke();
        topPlayer(ctx, rx, p.ty, { rot: dir * Math.PI / 2, glow: 'rgba(255,200,61,.18)' });
        if (p.out === 'catch') drawBall(ctx, rx + dir * 6, p.ty - 2, 1.1, 0);
      }
      // QB
      const throwing = p.phase !== 'play';
      topPlayer(ctx, QB.x, QB.y, { rot: Math.atan2(p.tx - QB.x, QB.y - p.ty) * 0.6, sx: throwing ? 1.08 : 1 });
      // ball in flight (fake height via scale + separate shadow)
      if (p.phase === 'flight') {
        const f = p.ball.t / p.ball.dur;
        const bx = lerp(QB.x, p.tx, f), by = lerp(QB.y - 10, p.ty, f);
        const h = Math.sin(Math.PI * f);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(bx + h * 10, by + h * 14, 5, 3, 0, 0, TAU);
        ctx.fill();
        drawBall(ctx, bx, by, 1.2 + h * 0.7, Math.atan2(p.ty - QB.y, p.tx - QB.x));
      } else if (p.phase === 'play') {
        drawBall(ctx, QB.x + 9, QB.y - 6, 1, -0.8);
      }
      if (p.phase === 'play') {
        // lead marker: tap when the receiver crosses it
        const flight = Math.hypot(p.tx - QB.x, p.ty - QB.y) / BALL_SPEED;
        const lx = p.tx - (p.fromLeft ? 1 : -1) * p.speed * flight;
        const near = Math.abs(rx - lx) < 10;
        ctx.strokeStyle = near ? C.good : 'rgba(255,255,255,.55)';
        ctx.lineWidth = near ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(lx, p.ty - 22);
        ctx.lineTo(lx, p.ty + 22);
        ctx.stroke();
        label(ctx, 'THROW', lx, p.ty + 34, { size: 11, color: near ? C.good : 'rgba(255,255,255,.7)' });
      }
      if (p.phase === 'play' && p.t > p.delay) {
        label(ctx, 'TAP TO THROW', W / 2, 578, { size: 15, color: `rgba(255,255,255,${0.6 + pulse * 0.4})` });
      }
    }

    // ---------- deep ball ----------
    // Top-down. The route is drawn; the receiver runs it with a corner trailing and a
    // safety rolling over the top. Tap a spot: the ball is lofted there, and whoever
    // is closest when it lands decides catch / pick / incomplete.
    function routeAt(d) {
      const path = p.path;
      let rem = clamp(d, 0, path.L);
      for (let k = 0; k < path.seg.length; k++) {
        if (rem <= path.seg[k]) {
          const f = path.seg[k] ? rem / path.seg[k] : 0;
          return { x: lerp(path.pts[k].x, path.pts[k + 1].x, f), y: lerp(path.pts[k].y, path.pts[k + 1].y, f) };
        }
        rem -= path.seg[k];
      }
      return path.pts[path.pts.length - 1];
    }
    const recDist = (t) => Math.max(0, t - DEEP_SNAP) * p.speed;
    const beforeSnap = () => p.t < DEEP_SNAP;

    function deepPlayers(t) {
      const rd = recDist(t);
      const rec = routeAt(rd);
      const cb0 = routeAt(Math.max(0, rd - p.lag));
      return { rec, cb: { x: cb0.x + p.inside * 9, y: cb0.y + 4 }, s: p.safetyPos, done: rd >= p.path.L };
    }

    function throwDeep(v) {
      if (p.phase !== 'play' || beforeSnap() || v.y > 450) return;
      const d = Math.hypot(v.x - QB.x, v.y - QB.y);
      p.ball = { t: 0, dur: 0.55 + d / DEEP_BALL_SPEED, to: { x: v.x, y: v.y } };
      p.phase = 'flight';
      firstDeep = false;
      buzz(12);
    }

    function updateDeep(dt) {
      p.t += dt;
      if (p.t > DEEP_SNAP && p.phase !== 'result') {
        // safety rolls toward the receiver at limited speed
        const rec = routeAt(recDist(p.t));
        const s = p.safetyPos;
        const dx = rec.x - s.x, dy = rec.y - 30 - s.y;
        const m = Math.hypot(dx, dy) || 1;
        const step = Math.min(m, p.safetySpeed * dt);
        s.x += (dx / m) * step;
        s.y += (dy / m) * step;
      }
      const st = deepPlayers(p.t);
      if (p.phase === 'play') {
        const runT = p.path.L / p.speed;
        clock = 1 - clamp((p.t - DEEP_SNAP) / (runT + 1.2));
        if (p.t > DEEP_SNAP + runT + 1.2) settle(0, 'SACKED', C.bad);
      } else if (p.phase === 'flight') {
        p.ball.t += dt;
        if (p.ball.t >= p.ball.dur) {
          const spot = p.ball.to;
          const dR = Math.hypot(st.rec.x - spot.x, st.rec.y - spot.y);
          const dC = Math.hypot(st.cb.x - spot.x, st.cb.y - spot.y);
          const dS = Math.hypot(st.s.x - spot.x, st.s.y - spot.y);
          const dD = Math.min(dC, dS);
          p.picker = dC < dS ? 'cb' : 's';
          if (dR <= DEEP_CATCH_R && dR <= dD + 4) {
            p.out = 'catch';
            settle(75 + 25 * (1 - dR / DEEP_CATCH_R), dR < 9 ? 'IN STRIDE!' : 'CAUGHT!', dR < 9 ? C.gold : C.good);
          } else if (dD <= 20 && dD < dR) {
            p.out = 'int';
            settle(0, 'PICKED OFF', C.bad);
          } else {
            p.out = 'miss';
            // ahead of him along the route = overthrown, behind = underthrown
            const ahead = !st.done && spot.y < st.rec.y;
            settle(Math.max(0, 45 - (dR - DEEP_CATCH_R) * 0.6), ahead ? 'OVERTHROWN' : 'UNDERTHROWN', '#ffd27a');
          }
        }
      } else {
        p.resT += dt;
        if (p.resT > 1.35) next();
      }
    }

    function drawDeep(time) {
      drawTurfTop(ctx, W, H, 0, 60);
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.strokeStyle = 'rgba(90,170,255,.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 488);
      ctx.lineTo(W, 488);
      ctx.stroke();
      for (let k = 0; k < 5; k++) topPlayer(ctx, 132 + k * 24, 500, { s: 0.85 });
      for (let k = 0; k < 4; k++) topPlayer(ctx, 144 + k * 24 + Math.sin(time * 6 + k) * 2, 474, { body: C.x, helmet: C.xHelmet, rot: Math.PI, s: 0.85 });

      // the route, drawn in full with an arrowhead
      const pts = p.path.pts;
      ctx.strokeStyle = 'rgba(255,200,61,.75)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -time * 20;
      ctx.beginPath();
      pts.forEach((pt, k) => (k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      const a = pts[pts.length - 1], b = pts[pts.length - 2];
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      ctx.fillStyle = 'rgba(255,200,61,.85)';
      ctx.beginPath();
      ctx.moveTo(a.x + Math.cos(ang) * 10, a.y + Math.sin(ang) * 10);
      ctx.lineTo(a.x + Math.cos(ang + 2.5) * 10, a.y + Math.sin(ang + 2.5) * 10);
      ctx.lineTo(a.x + Math.cos(ang - 2.5) * 10, a.y + Math.sin(ang - 2.5) * 10);
      ctx.fill();
      label(ctx, p.routeName.toUpperCase(), clamp(pts[0].x + p.inside * 40, 40, 320), 452, { size: 12, color: C.gold });

      const st = deepPlayers(p.t);
      const after = p.phase === 'result' ? p.resT : 0;
      // landing marker
      if (p.ball) {
        const sp = p.ball.to;
        ctx.strokeStyle = p.phase === 'flight' ? '#fff' : p.out === 'catch' ? C.good : p.out === 'int' ? C.bad : '#ffd27a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, DEEP_CATCH_R, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sp.x - 6, sp.y - 6);
        ctx.lineTo(sp.x + 6, sp.y + 6);
        ctx.moveTo(sp.x + 6, sp.y - 6);
        ctx.lineTo(sp.x - 6, sp.y + 6);
        ctx.stroke();
      }
      // defenders (the one who picks it off breaks on the ball)
      const face = (from, to) => Math.atan2(to.x - from.x, from.y - to.y);
      let cb = st.cb, s = st.s;
      if (p.out === 'int' && after > 0) {
        const k = easeOut(after * 3);
        const to = p.ball.to;
        if (p.picker === 'cb') cb = { x: lerp(cb.x, to.x, k), y: lerp(cb.y, to.y, k) };
        else s = { x: lerp(s.x, to.x, k), y: lerp(s.y, to.y, k) };
      }
      topPlayer(ctx, cb.x, cb.y, { body: C.x, helmet: C.xHelmet, rot: face(cb, st.rec) });
      topPlayer(ctx, s.x, s.y, { body: C.x, helmet: C.xHelmet, rot: face(s, st.rec), glow: 'rgba(255,107,90,.15)' });
      if (p.out === 'int' && after > 0) {
        const who = p.picker === 'cb' ? cb : s;
        drawBall(ctx, who.x + 8, who.y - 4, 1.1, 0.3);
      }
      // receiver faces down his route
      const nxt = routeAt(recDist(p.t) + 6);
      const look = nxt.x === st.rec.x && nxt.y === st.rec.y ? { x: st.rec.x, y: st.rec.y - 1 } : nxt;
      topPlayer(ctx, st.rec.x, st.rec.y, { rot: face(st.rec, look), glow: 'rgba(255,200,61,.2)' });
      if (p.out === 'catch') drawBall(ctx, st.rec.x + 7, st.rec.y - 2, 1.1, -1.2);
      // QB
      topPlayer(ctx, QB.x, QB.y, { sx: p.phase !== 'play' ? 1.08 : 1 });
      if (p.phase === 'play') drawBall(ctx, QB.x + 9, QB.y - 6, 1, -0.8);
      // lofted ball: rises (grows, lifts off its shadow) and drops onto the spot
      if (p.phase === 'flight') {
        const f = p.ball.t / p.ball.dur;
        const gx = lerp(QB.x, p.ball.to.x, f), gy = lerp(QB.y - 10, p.ball.to.y, f);
        const h = Math.sin(Math.PI * f);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(gx, gy, 6 - h * 2, 3.5 - h, 0, 0, TAU);
        ctx.fill();
        drawBall(ctx, gx, gy - h * 70, 1.2 + h * 1.2, Math.atan2(p.ball.to.y - QB.y, p.ball.to.x - QB.x) + f * 0.6);
      }
      if (p.phase === 'play') {
        label(ctx, beforeSnap() ? 'Read the route…' : 'TAP WHERE HE’LL BE', W / 2, 578, { size: 15, color: `rgba(255,255,255,${0.6 + pulse * 0.4})` });
        if (firstDeep && !beforeSnap()) {
          // first deep ball only: a ghost ring showing a good lead
          const lead = routeAt(recDist(p.t) + p.speed * 1.4);
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(lead.x, lead.y, DEEP_CATCH_R, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ---------- input ----------
    stage.on(stage.canvas, 'pointerdown', (e) => {
      e.preventDefault();
      if (!p) return;
      if (p.kind === 'tight') return throwTight();
      throwDeep(stage.toVirtual(e));
    });
    stage.on(window, 'keydown', (e) => {
      if (!p || p.phase !== 'play' || p.kind !== 'tight') return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        throwTight();
      }
    });

    next();
    stage.loop((dt, time) => {
      if (!p) return;
      if (p.kind === 'tight') updateTight(dt);
      else updateDeep(dt);
      if (!p) return;
      hud.clock(p.phase === 'play' ? clock : 0);
      fx.update(dt);
      stage.begin();
      if (p.kind === 'tight') drawTight(time);
      else drawDeep(time);
      fx.draw(ctx);
      stage.end();
    });
  });
}
