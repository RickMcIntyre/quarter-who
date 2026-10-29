// Wordle-style share text + a 1080x1350 image card drawn on canvas.
import { fmtHeight, drawSilhouette } from './silhouette.js';

export const SITE_URL = (() => {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  return u.href.replace(/index\.html$/, '');
})();

function bar(v) {
  const n = Math.round(v / 20);
  return '🟨'.repeat(n) + '⬛'.repeat(5 - n);
}

export function shareText(res, streak) {
  const b = res.build;
  const lines = [
    `Quarter-Who #${res.day}${res.practice ? ' (practice)' : ''}`,
    `My Franken-QB: ${fmtHeight(b.height)} ${b.weight} — ${res.similarity}% ${res.comp} 🏈`,
    `Arm ${res.scores.arm} | Legs ${res.scores.legs} | IQ ${res.scores.iq}`,
    `💪 ${bar(res.scores.arm)}`,
    `🏃 ${bar(res.scores.legs)}`,
    `🧠 ${bar(res.scores.iq)}`,
  ];
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(SITE_URL);
  return lines.join('\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export async function shareResultText(text) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
  return y;
}

export function drawCard(res, streak) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1422');
  g.addColorStop(1, '#13283f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // turf stripe band
  ctx.fillStyle = '#1f4a2c';
  ctx.fillRect(0, 300, W, 420);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 4;
  for (let x = 60; x < W; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 300);
    ctx.lineTo(x, 720);
    ctx.stroke();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffc83d';
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText('QUARTER-WHO?', 72, 130);
  ctx.fillStyle = '#9fb3c8';
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText(`Daily #${res.day}${res.practice ? ' · practice' : ''}${streak > 1 ? `  ·  🔥 ${streak}-day streak` : ''}`, 72, 190);
  ctx.fillText(`My Franken-QB: ${fmtHeight(res.build.height)} · ${res.build.weight} lb`, 72, 250);

  drawSilhouette(ctx, 230, 700, 1.25, res.build.height, res.build.weight);

  ctx.fillStyle = '#fff';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('PRO COMP', 440, 400);
  ctx.fillStyle = res.bust ? '#ff8a7a' : '#ffc83d';
  ctx.font = `900 150px ${FONT}`;
  ctx.fillText(`${res.similarity}%`, 440, 545);
  ctx.fillStyle = '#fff';
  let size = 72;
  ctx.font = `900 ${size}px ${FONT}`;
  while (ctx.measureText(res.comp).width > 600 && size > 40) ctx.font = `900 ${(size -= 4)}px ${FONT}`;
  ctx.fillText(res.comp, 440, 640);
  if (res.bust) {
    ctx.fillStyle = '#ff8a7a';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText('⚠ BUST ALERT', 440, 690);
  }

  const rows = [['ARM', res.scores.arm, '💪'], ['LEGS', res.scores.legs, '🏃'], ['IQ', res.scores.iq, '🧠']];
  rows.forEach(([name, v], k) => {
    const y = 800 + k * 92;
    ctx.fillStyle = '#9fb3c8';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(name, 72, y + 34);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(250, y, 640, 44);
    ctx.fillStyle = v >= 70 ? '#5ef08a' : v >= 40 ? '#ffc83d' : '#ff6b5a';
    ctx.fillRect(250, y, 640 * (v / 100), 44);
    ctx.fillStyle = '#fff';
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(String(v), 920, y + 38);
  });

  const p = res.proj;
  ctx.fillStyle = '#9fb3c8';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('PROJECTED SEASON', 72, 1120);
  ctx.fillStyle = '#fff';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(`${p.pass_yds.toLocaleString()} yds · ${p.pass_td} TD · ${p.int} INT · ${p.rush_yds} rush`, 72, 1180);

  ctx.fillStyle = '#6f86a0';
  ctx.font = `600 32px ${FONT}`;
  wrap(ctx, SITE_URL.replace(/^https?:\/\//, ''), 72, 1290, 940, 40);
  return c;
}

export async function shareCard(canvas, filename = 'quarter-who.png') {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: 'My Franken-QB' });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
