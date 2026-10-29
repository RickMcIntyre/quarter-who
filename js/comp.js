// Pro-comp matching: weighted nearest neighbor over (arm, legs, iq, height, weight).
// Traits are weighted heavier than size so how you PLAY decides your comp more than how you're BUILT.

export const WEIGHTS = { arm: 1.0, legs: 1.0, iq: 1.0, height: 0.45, weight: 0.35 };
const SCALES = { arm: 100, legs: 100, iq: 100, height: 12, weight: 70 };

function distance(player, q) {
  const vals = {
    arm: player.arm - q.arm,
    legs: player.legs - q.legs,
    iq: player.iq - q.iq,
    height: player.height - q.height_in,
    weight: player.weight - q.weight_lb,
  };
  let sum = 0, wsum = 0;
  for (const k in WEIGHTS) {
    sum += WEIGHTS[k] * (vals[k] / SCALES[k]) ** 2;
    wsum += WEIGHTS[k];
  }
  return Math.sqrt(sum / wsum);
}

export const similarity = (d) => Math.max(40, Math.min(99, Math.round(100 - d * 160)));

const clampR = (v, a, b) => Math.max(a, Math.min(b, v));

// Scale the comp's real season by how the player's traits compare to the comp's.
export function projectSeason(player, q) {
  const s = q.season;
  const passP = player.arm * 0.6 + player.iq * 0.4;
  const passC = q.arm * 0.6 + q.iq * 0.4;
  const pr = clampR(passP / passC, 0.65, 1.35);
  const ir = clampR((120 - player.iq) / (120 - q.iq), 0.6, 1.7);
  const rr = clampR((player.legs + 10) / (q.legs + 10), 0.5, 1.6);
  return {
    pass_yds: Math.round((s.pass_yds * pr) / 10) * 10,
    pass_td: Math.max(0, Math.round(s.pass_td * pr)),
    int: Math.max(0, Math.round(s.int * ir)),
    rush_yds: s.rush_yds <= 0 ? Math.round(s.rush_yds * (2 - rr)) : Math.round((s.rush_yds * rr) / 5) * 5,
  };
}

export function draftStock(overall) {
  if (overall >= 88) return 'Top-5 pick';
  if (overall >= 76) return 'First round';
  if (overall >= 62) return 'Day 2 pick';
  if (overall >= 48) return 'Day 3 flyer';
  if (overall >= 32) return 'Undrafted free agent';
  return 'Open tryout — bring your own cleats';
}

export function computeComp(qbs, player) {
  const ranked = qbs.map((q) => ({ q, d: distance(player, q) })).sort((a, b) => a.d - b.d);
  const best = ranked[0];
  const overall = Math.round((player.arm + player.legs + player.iq) / 3);
  return {
    qb: best.q,
    similarity: similarity(best.d),
    alts: ranked.slice(1, 3).map((r) => ({ name: r.q.name, similarity: similarity(r.d) })),
    proj: projectSeason(player, best.q),
    overall,
    stock: draftStock(overall),
  };
}
