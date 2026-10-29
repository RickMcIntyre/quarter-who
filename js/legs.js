// Challenge 2 — LEGS. Scramble upfield through a wave of rushers.
// Swipe / tap sides to juke, swipe up / tap middle to spin. Returns 0–100.
// Build matters: lighter = quicker jukes + shorter spin cooldown, heavier = more broken tackles,
// taller = slightly longer stride (top speed).
import { createStage, Floaters, clamp, lerp, easeOut, C, TAU, buzz, topPlayer, drawTurfTop, drawBall, label } from './engine.js';

export const meta = {
  id: 'legs',
  title: 'Legs',
  icon: '🏃',
  howTo: [
    '<b>Juke</b> — swipe or tap left / right (← →).',
    '<b>Spin</b> — swipe up or tap the middle (↑ / space). Spinning through contact = a missed tackle.',
    'Score = yards + defenders made to miss. Light builds juke faster; heavy builds break tackles.',
  ],
};

const W = 360, H = 600;
const LANES = [64, 122, 180, 238, 296];
const QBY = 470;
const PX_PER_YD = 20;
const DURATION = 22;

export function buildTraits(build) {
  const wN = clamp((build.weight - 195) / 55);
  const hN = clamp((build.height - 70) / 8);
  return {
    jukeDur: 0.09 + wN * 0.09,
    spinDur: 0.5,
    spinCd: 0.55 + wN * 0.4,
    speedYd: 4.4 * (0.93 + hN * 0.14),
    breakP: 0.3 + wN * 0.4,
  };
}

export function run({ host, rng, build, hud }) {
  return new Promise((resolve) => {
    const stage = createStage(host, W, H);
    const { ctx } = stage;
    const fx = new Floaters();
    const tr = buildTraits(build);

    // Pre-generate the whole rush so every player faces the same defense today.
    const spawns = [];
    for (let t = 0.8; t < DURATION - 1.5; ) {
      const prog = t / DURATION;
      const roll = rng.next();
      const type = roll < 0.5 ? 'rush' : roll < 0.88 ? 'chase' : 'spy';
      spawns.push({ t, lane: rng.int(0, 4), type, spd: rng.range(25, 55) + prog * 30, react: rng.range(0.7, 1.1) });
      t += rng.range(1.0, 1.6) * (1 - prog * 0.25);
    }
    const rolls = Array.from({ length: 80 }, () => rng.next());
    let rollI = 0;

    const qb = { lane: 2, x: LANES[2], fromX: LANES[2], toX: LANES[2], jT: 1, spinT: -1, cd: 0, stumble: 0, lean: 0 };
    let defs = [];
    let si = 0, time = 0, yards = 0, misses = 0, scroll = 0, phase = 'run', endT = 0, tackler = null;
    let flash = { zone: -1, t: 0 };

    function juke(dir) {
      if (phase !== 'run' || qb.jT < 0.5) return;
      const lane = clamp(qb.lane + dir, 0, 4);
      if (lane === qb.lane) return;
      qb.lane = lane;
      qb.fromX = qb.x;
      qb.toX = LANES[lane];
      qb.jT = 0;
      qb.lean = dir;
      fx.burst(qb.x - dir * 10, QBY + 10, 'rgba(255,255,255,.7)', 6, 60);
      flash = { zone: dir < 0 ? 0 : 2, t: 0.2 };
      buzz(8);
    }
    function spin() {
      if (phase !== 'run' || qb.cd > 0) return;
      qb.spinT = 0;
      qb.cd = tr.spinCd;
      flash = { zone: 1, t: 0.2 };
      buzz(8);
    }

    function finish() {
      stage.destroy();
      const score = Math.min(100, Math.round(yards * 0.6 + misses * 7));
      resolve({ score, detail: { yards: Math.round(yards), misses } });
    }

    function update(dt) {
      if (flash.t > 0) flash.t -= dt;
      if (phase === 'run') {
        time += dt;
        if (time >= DURATION) {
          phase = 'done';
          fx.text(W / 2, 220, 'SCRAMBLE SURVIVED!', { color: C.gold, size: 24, life: 1.4 });
          fx.burst(qb.x, QBY, C.gold, 24);
        }
        if (qb.stumble > 0) qb.stumble -= dt;
        const speed = tr.speedYd * (qb.stumble > 0 ? 0.45 : 1);
        yards += speed * dt;
        scroll += speed * PX_PER_YD * dt;

        while (si < spawns.length && spawns[si].t <= time) {
          const s = spawns[si++];
          defs.push({ ...s, x: LANES[s.lane], y: -30, rT: s.react, threat: false, done: false, fly: null });
        }
        if (qb.jT < 1) {
          qb.jT = Math.min(1, qb.jT + dt / tr.jukeDur);
          qb.x = lerp(qb.fromX, qb.toX, easeOut(qb.jT));
        }
        qb.lean *= Math.pow(0.02, dt);
        if (qb.spinT >= 0) {
          qb.spinT += dt;
          if (qb.spinT > tr.spinDur) qb.spinT = -1;
        }
        qb.cd = Math.max(0, qb.cd - dt);

        for (const d of defs) {
          if (d.fly) continue;
          d.y += (speed * PX_PER_YD + d.spd) * dt;
          if (d.type !== 'rush' && d.y < QBY - 50) {
            d.rT -= dt;
            if (d.rT <= 0) {
              d.rT = d.type === 'spy' ? 0.6 : d.react;
              d.lane = d.type === 'spy' ? qb.lane : d.lane + Math.sign(qb.lane - d.lane);
            }
          }
          const tx = LANES[d.lane];
          const mv = (d.type === 'spy' ? 150 : 120) * dt;
          d.x += clamp(tx - d.x, -mv, mv);
          if (d.done) continue;
          const dx = Math.abs(d.x - qb.x);
          if (dx < 34 && d.y > QBY - 140 && d.y < QBY) d.threat = true;
          if (dx < 20 && Math.abs(d.y - QBY) < 16) {
            d.done = true;
            const side = d.x < qb.x ? -1 : 1;
            if (qb.spinT >= 0) {
              misses++;
              d.fly = { vx: side * 160, vy: 60, rot: 0 };
              fx.text(qb.x, QBY - 50, 'SPIN MOVE!', { color: C.gold });
              fx.ring(qb.x, QBY, C.gold);
              buzz(15);
            } else if (rolls[rollI++ % rolls.length] < tr.breakP) {
              misses++;
              qb.stumble = 0.5;
              d.fly = { vx: side * 120, vy: 140, rot: 0 };
              fx.text(qb.x, QBY - 50, 'BROKE IT!', { color: '#ffb347' });
              fx.burst(qb.x, QBY - 8, '#fff', 16, 180);
              stage.shake(0.6);
              buzz(25);
            } else {
              phase = 'down';
              tackler = d;
              fx.text(qb.x, QBY - 60, 'TACKLED', { color: C.bad, size: 30, life: 1.4 });
              fx.burst(qb.x, QBY, '#d9d9d9', 20, 120);
              stage.shake(1);
              buzz([40, 30, 40]);
            }
          } else if (d.y > QBY + 20) {
            d.done = true;
            if (d.threat) {
              misses++;
              fx.text(d.x, QBY + 40, 'MISSED!', { color: C.good, size: 18 });
            }
          }
        }
        for (const d of defs) {
          if (d.fly) {
            d.x += d.fly.vx * dt;
            d.y += d.fly.vy * dt;
            d.fly.rot += dt * 9 * Math.sign(d.fly.vx);
          }
        }
        defs = defs.filter((d) => d.y < H + 40 && d.x > -40 && d.x < W + 40);
      } else {
        endT += dt;
        if (tackler) {
          tackler.x = lerp(tackler.x, qb.x + 6, 0.2);
          tackler.y = lerp(tackler.y, QBY - 4, 0.2);
        }
        if (endT > 1.4) finish();
      }
      hud.status(`${Math.round(yards)} yds · ${misses} missed tackle${misses === 1 ? '' : 's'}`);
      hud.clock(1 - time / DURATION);
    }

    function draw(t) {
      drawTurfTop(ctx, W, H, scroll, 100);
      // sidelines + yard numbers that scroll with you
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(16, 0, 4, H);
      ctx.fillRect(W - 20, 0, 4, H);
      // yard line L sits at y = scroll - 100L + 500 (matches drawTurfTop's 100px step)
      const base = Math.floor((scroll - 120) / 100);
      for (let k = 0; k < 8; k++) {
        const lineIdx = base + k;
        if (lineIdx % 2) continue;
        const y = scroll - lineIdx * 100 + 500;
        const yd = 20 + lineIdx * 5;
        const shown = yd <= 50 ? yd : yd <= 100 ? 100 - yd : null;
        if (shown === null || shown <= 0 || y < -20 || y > H + 20) continue;
        label(ctx, String(shown), 38, y, { size: 18, color: 'rgba(255,255,255,.55)', stroke: false });
        label(ctx, String(shown), W - 38, y, { size: 18, color: 'rgba(255,255,255,.55)', stroke: false });
      }
      // tap zones (flash on use)
      if (flash.t > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash.t * 0.5})`;
        ctx.fillRect(flash.zone * 120, 0, 120, H);
      }
      // speed lines behind QB
      if (phase === 'run') {
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const ox = (k - 1) * 8;
          const len = 14 + ((t * 60 + k * 7) % 10);
          ctx.beginPath();
          ctx.moveTo(qb.x + ox, QBY + 16);
          ctx.lineTo(qb.x + ox, QBY + 16 + len);
          ctx.stroke();
        }
      }
      for (const d of defs) {
        if (d === tackler) continue;
        const rot = d.fly ? d.fly.rot : Math.PI + clamp((qb.x - d.x) / 200, -0.4, 0.4);
        topPlayer(ctx, d.x, d.y, { body: C.x, helmet: C.xHelmet, rot, alpha: d.fly ? 0.8 : 1, glow: d.type === 'spy' ? 'rgba(255,107,90,.18)' : null });
      }
      const spinA = qb.spinT >= 0 ? (qb.spinT / tr.spinDur) * TAU : 0;
      const squash = qb.jT < 1 ? 1 + 0.15 * Math.sin(qb.jT * Math.PI) : 1;
      const downTilt = phase === 'down' ? Math.min(1, endT * 3) * 1.4 : 0;
      topPlayer(ctx, qb.x, QBY, { rot: spinA + qb.lean * 0.35 + downTilt, sx: squash, sy: 1 / squash, glow: qb.stumble > 0 ? 'rgba(255,179,71,.3)' : null });
      drawBall(ctx, qb.x + 9 * Math.cos(spinA), QBY + 2 + 9 * Math.sin(spinA), 0.9, spinA);
      if (tackler) topPlayer(ctx, tackler.x, tackler.y, { body: C.x, helmet: C.xHelmet, rot: Math.PI - 0.5 });

      // spin cooldown pip under QB
      if (qb.cd > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(qb.x, QBY, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - qb.cd / tr.spinCd));
        ctx.stroke();
      }
      // control hints
      ctx.globalAlpha = 0.55;
      label(ctx, '◀ JUKE', 60, 572, { size: 13 });
      label(ctx, qb.cd > 0 ? 'SPIN …' : 'SPIN ⟳', 180, 572, { size: 13 });
      label(ctx, 'JUKE ▶', 300, 572, { size: 13 });
      ctx.globalAlpha = 1;
    }

    // swipe fires as soon as the finger travels far enough; plain taps use thirds
    let ptr = null;
    stage.on(stage.canvas, 'pointerdown', (e) => {
      e.preventDefault();
      ptr = { id: e.pointerId, start: stage.toVirtual(e), fired: false };
    });
    stage.on(stage.canvas, 'pointermove', (e) => {
      if (!ptr || ptr.id !== e.pointerId || ptr.fired) return;
      const v = stage.toVirtual(e);
      const dx = v.x - ptr.start.x, dy = v.y - ptr.start.y;
      if (Math.hypot(dx, dy) < 26) return;
      ptr.fired = true;
      if (-dy > Math.abs(dx)) spin();
      else juke(Math.sign(dx));
    });
    stage.on(stage.canvas, 'pointerup', (e) => {
      if (!ptr || ptr.id !== e.pointerId) return;
      if (!ptr.fired) {
        const x = ptr.start.x;
        if (x < W / 3) juke(-1);
        else if (x > (W * 2) / 3) juke(1);
        else spin();
      }
      ptr = null;
    });
    stage.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') juke(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') juke(1);
      else if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') spin();
      else return;
      e.preventDefault();
    });

    stage.loop((dt, t) => {
      update(dt);
      fx.update(dt);
      stage.begin();
      draw(t);
      fx.draw(ctx);
      stage.end();
    });
  });
}
