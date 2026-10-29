// Streak + history in localStorage. Every access is guarded: private mode or
// blocked storage just means no streak, never a broken game.
import { prevKey } from './rng.js';

const KEY = 'quarterwho:v1';
const EMPTY = { streak: 0, best: 0, last: null, history: {} };

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* storage unavailable */ }
}

// The streak counts consecutive days with a completed daily run.
// Read-time check: if the last run was before yesterday, the streak is broken.
export function currentStreak(store, today) {
  if (!store.last) return 0;
  if (store.last === today || store.last === prevKey(today)) return store.streak;
  return 0;
}

// Only the first daily run of a date counts.
export function recordResult(dateKey, result) {
  const store = loadStore();
  if (store.history[dateKey]) return store;
  store.streak = store.last === prevKey(dateKey) ? store.streak + 1 : 1;
  store.best = Math.max(store.best, store.streak);
  store.last = dateKey;
  store.history[dateKey] = result;
  save(store);
  return store;
}

export function getResult(dateKey) {
  return loadStore().history[dateKey] || null;
}
