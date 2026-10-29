// App shell: screens, run flow, results. Challenge modules are plugged in via CHALLENGES.
import { makeRng, todayKey, dayNumber, msToMidnight } from './rng.js';
import * as arm from './arm.js';
import * as legs from './legs.js';
import * as iq from './iq.js';
import { computeComp } from './comp.js';
import { silhouetteSVG, applySilhouette, fmtHeight } from './silhouette.js';
import { loadStore, recordResult, getResult, currentStreak } from './storage.js';
import { shareText, shareResultText, drawCard, shareCard } from './share.js';

const CHALLENGES = [arm, legs, iq];

const params = new URLSearchParams(location.search);
const DATE = /^\d{4}-\d{2}-\d{2}$/.test(params.get('seed') || '') ? params.get('seed') : todayKey();
const DAY = dayNumber(DATE);
const DRILL = ['arm', 'legs', 'iq'].includes(params.get('drill')) ? params.get('drill') : null;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let QBS = [];
const state = { build: { height: 74, weight: 220 }, practice: false, running: false };

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------------- HOME ----------------
function renderHome() {
  const store = loadStore();
  const streak = currentStreak(store, DATE);
  const d = new Date(DATE + 'T12:00:00');
  $('#home-day').textContent = `Daily #${DAY} · ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  $('#home-streak').textContent = `🔥 ${streak}-day streak`;
  $('#home-best').textContent = `Best ${store.best}`;
  const done = getResult(DATE);
  const box = $('#home-done');
  if (done) {
    box.hidden = false;
    box.innerHTML = `<span>Today's comp</span><b>${done.similarity}% ${esc(done.comp)}</b><small>Arm ${done.scores.arm} · Legs ${done.scores.legs} · IQ ${done.scores.iq}</small>`;
    $('#btn-start').textContent = "See today's result";
    $('#btn-practice').hidden = false;
  } else {
    box.hidden = true;
    $('#btn-start').textContent = "Start today's run";
    $('#btn-practice').hidden = true;
  }
}

// ---------------- BUILD ----------------
function meter(label, v, hint) {
  const n = Math.round(v * 4) + 1;
  return `<div class="meter"><span>${label}</span><span class="dots">${'●'.repeat(n)}<em>${'●'.repeat(5 - n)}</em></span><small>${hint}</small></div>`;
}

function renderBuild() {
  const { height, weight } = state.build;
  $('#in-height').value = height;
  $('#in-weight').value = weight;
  $('#ro-height').textContent = fmtHeight(height);
  $('#ro-weight').textContent = `${weight} lb`;
  applySilhouette($('#sil-box'), height, weight);
  const tr = legs.buildTraits(state.build);
  const quick = 1 - (tr.jukeDur - 0.1) / 0.12;
  const power = (tr.breakP - 0.12) / 0.48;
  const hN = (height - 70) / 8;
  $('#effects').innerHTML =
    meter('Juke quickness', quick, 'lighter = faster cuts') +
    meter('Tackle-breaking', power, 'heavier = shed arm tackles') +
    meter('Stride', hN, 'taller = more ground per second') +
    meter('Pocket vision', hN, 'taller = more time to read');
  for (const id of ['in-height', 'in-weight']) {
    const el = $('#' + id);
    el.style.setProperty('--fill', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
  }
}

// ---------------- RUN ----------------
const hud = {
  status: (t) => ($('#hud-status').textContent = t),
  clock: (f) => ($('#hud-clock').style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`),
  pips(scores, n) {
    let html = '';
    for (let k = 0; k < n; k++) {
      const s = scores[k];
      const cls = s === undefined ? '' : s >= 70 ? 'good' : s >= 35 ? 'ok' : 'bad';
      html += `<i class="${cls}${k === scores.length ? ' cur' : ''}"></i>`;
    }
    $('#hud-pips').innerHTML = html;
  },
};

function overlay(html, cls = '') {
  const o = $('#overlay');
  o.className = 'overlay ' + cls;
  o.innerHTML = html;
  o.hidden = false;
  return o;
}
function hideOverlay() {
  $('#overlay').hidden = true;
}

function intro(meta, idx, total) {
  return new Promise((resolve) => {
    const o = overlay(`
      <div class="card intro">
        <p class="kicker">Drill ${idx + 1} of ${total}</p>
        <div class="intro-icon">${meta.icon}</div>
        <h2>${meta.title}</h2>
        <ul>${meta.howTo.map((h) => `<li>${h}</li>`).join('')}</ul>
        <button class="btn primary" data-go>Ready</button>
      </div>`);
    o.querySelector('[data-go]').addEventListener('click', () => resolve(), { once: true });
  });
}

async function countdown() {
  for (const n of ['3', '2', '1', 'GO!']) {
    overlay(`<div class="count">${n}</div>`, 'clear');
    await wait(n === 'GO!' ? 450 : 520);
  }
  hideOverlay();
}

const VERDICT = {
  arm: [[85, 'Rocket launcher.'], [65, 'NFL arm.'], [40, 'Needs a stronger base.'], [0, 'Ducks everywhere.']],
  legs: [[85, 'Ankles: broken.'], [65, 'Slippery.'], [40, 'Gets what’s there.'], [0, 'Statue.']],
  iq: [[85, 'Film-room junkie.'], [65, 'Sees the field.'], [40, 'Still learning the playbook.'], [0, 'Wrong huddle.']],
};

function scoreSplash(meta, score) {
  return new Promise((resolve) => {
    const verdict = VERDICT[meta.id].find(([min]) => score >= min)[1];
    const o = overlay(`
      <div class="card splash">
        <p class="kicker">${meta.icon} ${meta.title}</p>
        <div class="big-score" data-n>0</div>
        <p class="verdict">${verdict}</p>
        <button class="btn primary" data-go>Next →</button>
      </div>`);
    countUp(o.querySelector('[data-n]'), score, 700);
    const go = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(go, 2600);
    o.querySelector('[data-go]').addEventListener('click', go, { once: true });
  });
}

function countUp(el, to, ms = 800, fmt = (v) => String(v)) {
  const from = 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function runChallenges() {
  if (state.running) return;
  state.running = true;
  // ?drill=<id> plays just that drill (dev/tuning); it never counts toward the daily
  const list = DRILL ? CHALLENGES.filter((m) => m.meta.id === DRILL) : CHALLENGES;
  const seed = state.practice || (DRILL && !params.get('seed')) ? `practice-${Date.now()}` : DATE;
  const scores = {};
  show('screen-play');
  try {
    for (let k = 0; k < list.length; k++) {
      const mod = list[k];
      $('#hud-title').textContent = `${mod.meta.icon} ${mod.meta.title.toUpperCase()}`;
      hud.status('');
      hud.pips([], 0);
      hud.clock(1);
      $('#stage').innerHTML = '';
      await intro(mod.meta, k, list.length);
      await countdown();
      const res = await mod.run({ host: $('#stage'), rng: makeRng(`${seed}:${mod.meta.id}`), build: { ...state.build }, hud });
      scores[mod.meta.id] = res.score;
      await scoreSplash(mod.meta, res.score);
    }
  } finally {
    hideOverlay();
    state.running = false;
  }
  if (DRILL) {
    toast(`${DRILL.toUpperCase()} ${scores[DRILL]}`);
    renderHome();
    show('screen-home');
    return;
  }
  finishRun(scores);
}

function finishRun(scores) {
  const player = { ...state.build, ...scores };
  const c = computeComp(QBS, player);
  const result = {
    date: DATE,
    day: DAY,
    practice: state.practice,
    build: { ...state.build },
    scores,
    comp: c.qb.name,
    similarity: c.similarity,
  };
  let store = loadStore();
  if (!state.practice) store = recordResult(DATE, result);
  renderResult(result, store);
}

// ---------------- RESULT ----------------
function renderResult(result, store = loadStore()) {
  const player = { ...result.build, ...result.scores };
  const c = computeComp(QBS, player);
  const q = c.qb;
  result.proj = c.proj;
  result.bust = !!q.bust;
  const streak = state.practice ? currentStreak(store, DATE) : store.streak;
  const traits = [['arm', '💪 Arm'], ['legs', '🏃 Legs'], ['iq', '🧠 IQ']];
  const s = q.season;

  $('#result').innerHTML = `
    <p class="kicker">Daily #${result.day}${result.practice ? ' · practice' : ''} · ${fmtHeight(result.build.height)} ${result.build.weight} lb</p>
    <p class="label">Your pro comp</p>
    <div class="comp ${q.bust ? 'bust' : ''}">
      <div class="ring" style="--p:0"><span data-sim>0%</span></div>
      <div>
        <h2>${esc(q.name)}</h2>
        <p class="era">${esc(q.era)} · ${fmtHeight(q.height_in)} ${q.weight_lb} lb</p>
        ${q.bust ? '<p class="bust-tag">⚠ Bust alert</p>' : ''}
      </div>
    </div>
    <p class="blurb">“${esc(q.blurb)}”</p>
    <p class="stock">Draft stock: <b>${c.stock}</b></p>

    <div class="traits">
      ${traits.map(([k, l]) => `
        <div class="trait">
          <span>${l}</span>
          <div class="tbar"><i class="you" style="--w:${result.scores[k]}%"></i><i class="them" style="--w:${q[k]}%"></i></div>
          <b>${result.scores[k]}</b>
        </div>`).join('')}
      <p class="legend"><i class="you"></i>You <i class="them"></i>${esc(q.name.split(' ').slice(-1)[0])}</p>
    </div>

    <p class="label">Projected season</p>
    <div class="statline">
      <div><b data-stat="${c.proj.pass_yds}">0</b><span>Pass yds</span></div>
      <div><b data-stat="${c.proj.pass_td}">0</b><span>TD</span></div>
      <div><b data-stat="${c.proj.int}">0</b><span>INT</span></div>
      <div><b data-stat="${c.proj.rush_yds}">0</b><span>Rush yds</span></div>
    </div>
    <p class="fine">Scaled from ${esc(q.name.split(' ').slice(-1)[0])}'s ${s.year}: ${s.pass_yds.toLocaleString()} yds, ${s.pass_td} TD, ${s.int} INT, ${s.rush_yds} rush.</p>
    <p class="alts">Also resembles: ${c.alts.map((a) => `${esc(a.name)} (${a.similarity}%)`).join(', ')}</p>

    <div class="cta-stack">
      <button class="btn primary" id="btn-share">Share result</button>
      <button class="btn" id="btn-card">Share image card</button>
    </div>
    <img class="card-preview" id="card-preview" alt="Share card preview">
    <div class="chips center">
      <span class="chip">🔥 ${streak}-day streak</span><span class="chip">Best ${store.best}</span>
    </div>
    <p class="fine" id="next-run"></p>
    <div class="cta-stack">
      <button class="btn ghost" id="btn-again">Practice run</button>
      <button class="btn ghost" id="btn-home">Home</button>
    </div>
    <p class="fine disclaimer">Names and public stats only. Not affiliated with the NFL or any team. Trait ratings are our own opinion.</p>`;

  show('screen-result');

  // animate in
  const ring = $('#result .ring');
  const sim = $('[data-sim]');
  const t0 = performance.now();
  const anim = (t) => {
    const k = Math.min(1, (t - t0) / 1100);
    const e = 1 - Math.pow(1 - k, 3);
    ring.style.setProperty('--p', (result.similarity * e).toFixed(1));
    sim.textContent = `${Math.round(result.similarity * e)}%`;
    if (k < 1) requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);
  requestAnimationFrame(() => $('#result').classList.add('in'));
  document.querySelectorAll('[data-stat]').forEach((el) => countUp(el, Number(el.dataset.stat), 1200, (v) => v.toLocaleString()));

  const card = drawCard(result, streak);
  $('#card-preview').src = card.toDataURL('image/png');

  $('#btn-share').onclick = async () => {
    const r = await shareResultText(shareText(result, streak));
    if (r === 'copied') toast('Copied to clipboard');
    else if (r === 'failed') toast('Could not copy');
  };
  $('#btn-card').onclick = async () => {
    const r = await shareCard(card, `quarter-who-${result.day}.png`);
    if (r === 'downloaded') toast('Card saved');
  };
  $('#btn-again').onclick = () => {
    state.practice = true;
    goBuild();
  };
  $('#btn-home').onclick = () => {
    renderHome();
    show('screen-home');
  };

  const nr = $('#next-run');
  clearInterval(renderResult.timer);
  const tick = () => {
    const ms = msToMidnight();
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), sec = Math.floor((ms % 6e4) / 1000);
    nr.textContent = `Next daily run in ${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  };
  tick();
  renderResult.timer = setInterval(tick, 1000);
}

function goBuild() {
  renderBuild();
  show('screen-build');
}

// ---------------- WIRE UP ----------------
async function init() {
  $('#sil-box').innerHTML = silhouetteSVG();
  try {
    QBS = await (await fetch('data/qbs.json')).json();
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin', '<p class="fatal">Could not load data/qbs.json — serve this folder over http (see README).</p>');
    throw e;
  }

  renderHome();
  renderBuild();

  $('#btn-start').onclick = () => {
    const done = getResult(DATE);
    if (done && !DRILL) {
      state.practice = false;
      state.build = { ...done.build };
      renderResult(done);
    } else {
      state.practice = false;
      goBuild();
    }
  };
  $('#btn-practice').onclick = () => {
    state.practice = true;
    goBuild();
  };
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show('screen-home')));
  $('#in-height').addEventListener('input', (e) => {
    state.build.height = Number(e.target.value);
    renderBuild();
  });
  $('#in-weight').addEventListener('input', (e) => {
    state.build.weight = Number(e.target.value);
    renderBuild();
  });
  $('#btn-lock').onclick = () => runChallenges();
}

init();
