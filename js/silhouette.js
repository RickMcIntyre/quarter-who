// Generic QB silhouette (no team marks). The same path strings feed the build
// screen's SVG and the share card's canvas (via Path2D).

export const VIEW = { w: 200, h: 320, footY: 312 };

export const PARTS = {
  legs: 'M70,170 L130,170 L136,236 L126,306 L106,306 L104,242 L96,242 L94,306 L74,306 L64,236 Z',
  cleats: 'M70,302 L96,302 L96,312 L64,312 Z M104,302 L130,302 L136,312 L104,312 Z',
  torso: 'M56,88 Q100,64 144,88 L152,112 L137,120 L133,172 L67,172 L63,120 L48,112 Z',
  armL: 'M50,108 L36,170 Q38,180 48,178 L64,124 Z',
  armR: 'M148,106 L170,82 L178,56 Q174,48 166,52 L158,78 L136,100 Z',
  helmet: 'M74,46 A26,26 0 1 1 126,46 L126,60 L74,60 Z',
  mask: 'M120,40 L134,44 L134,62 L118,62',
  ball: 'M162,48 A12,7 -35 1 1 186,32 A12,7 -35 1 1 162,48 Z',
};

export function scaleFor(heightIn, weightLb) {
  const hN = Math.max(0, Math.min(1, (heightIn - 70) / 8));
  const wN = Math.max(0, Math.min(1, (weightLb - 195) / 55));
  const sy = 0.8 + hN * 0.18;
  // width tracks weight, slightly offset by height (same weight on a taller frame reads leaner)
  const sx = (0.8 + wN * 0.36) * (1 + (0.5 - hN) * 0.08);
  return { sx, sy };
}

export function fmtHeight(inches) {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function silhouetteSVG() {
  return `
  <svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" class="silhouette" aria-hidden="true">
    <defs>
      <linearGradient id="silg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--gold)"/>
        <stop offset="1" stop-color="var(--gold-deep)"/>
      </linearGradient>
    </defs>
    <line x1="10" x2="190" y1="${VIEW.footY}" y2="${VIEW.footY}" class="sil-ground"/>
    <line x1="10" x2="190" y1="0" y2="0" class="sil-ref" id="sil-ref"/>
    <g id="sil-body" class="sil-body">
      <path d="${PARTS.legs}"/>
      <path d="${PARTS.cleats}" class="sil-dark"/>
      <path d="${PARTS.armL}"/>
      <path d="${PARTS.torso}"/>
      <path d="${PARTS.armR}"/>
      <path d="${PARTS.helmet}"/>
      <path d="${PARTS.mask}" class="sil-mask"/>
      <path d="${PARTS.ball}" class="sil-ball"/>
      <text x="100" y="140" class="sil-num">?</text>
    </g>
  </svg>`;
}

// helmet top sits at y≈20 in path space; return the scaled y so a ruler line can track it
export function applySilhouette(root, heightIn, weightLb) {
  const { sx, sy } = scaleFor(heightIn, weightLb);
  const body = root.querySelector('#sil-body');
  body.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  const top = VIEW.footY - (VIEW.footY - 20) * sy;
  const ref = root.querySelector('#sil-ref');
  ref.setAttribute('y1', top);
  ref.setAttribute('y2', top);
}

export function drawSilhouette(ctx, x, footY, scale, heightIn, weightLb, color = '#ffc83d') {
  const { sx, sy } = scaleFor(heightIn, weightLb);
  ctx.save();
  ctx.translate(x, footY);
  ctx.scale(scale * sx, scale * sy);
  ctx.translate(-VIEW.w / 2, -VIEW.footY);
  ctx.fillStyle = color;
  for (const k of ['legs', 'armL', 'torso', 'armR', 'helmet']) ctx.fill(new Path2D(PARTS[k]));
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fill(new Path2D(PARTS.cleats));
  ctx.fillStyle = '#8a4b22';
  ctx.fill(new Path2D(PARTS.ball));
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.lineWidth = 4;
  ctx.stroke(new Path2D(PARTS.mask));
  ctx.restore();
}
