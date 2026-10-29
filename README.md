# Quarter-Who? 🏈

Build a quarterback, survive three ~30-second drills (Arm, Legs, IQ) and get your NFL **pro comp**.
It's a daily game: everyone gets the same drills each day.

Static site: vanilla JS (ES modules), HTML and CSS. No build step, no backend.

## Run locally

The game loads `data/qbs.json` with `fetch`, so opening `index.html` straight from disk won't work. Serve the folder instead:

```bash
python -m http.server 8770
```

Then open http://localhost:8770.

- `?seed=2026-11-03` plays a specific day's seed (useful for testing and tuning).
- `?drill=arm|legs|iq` plays just one drill (never counts toward the daily). Combine with `?seed=` to replay a specific day's version.
- A practice run (offered after the daily run) uses a random seed and doesn't count toward the streak.

## Deploy to GitHub Pages

Push this folder to a repo and turn on Pages (Settings → Pages → deploy from branch, root). Every path is relative, so it also works from a subpath like `user.github.io/quarter-who/`. The share URL comes from the page's own address.

## Structure

```
index.html          screens: home, build, play (HUD + stage + overlay), result
css/style.css       all styling, mobile-first
data/qbs.json       pro-comp database
js/main.js          app flow: screens, run loop, results, wiring
js/engine.js        shared canvas stage (virtual 360x600, letterboxed), input helpers, drawing, particles
js/rng.js           seeded RNG (xmur3 + mulberry32), date keys, Daily # numbering (EPOCH)
js/arm.js           Drill 1: tight-window and deep-ball throws
js/legs.js          Drill 2: scramble (juke / spin / break tackles)
js/iq.js            Drill 3: 7 read types (open man, blitz, hot route, leverage, man/zone, box count, shell), 5 per day
js/comp.js          weighted nearest-neighbor matching, season projection, draft stock
js/silhouette.js    QB silhouette paths (shared by the SVG and the share card)
js/share.js         share text, 1080x1350 image card, Web Share / clipboard / download
js/storage.js       localStorage streak + history (first run of each day counts)
```

### Challenge module contract

Each drill is self-contained, so you can tune it or swap it out:

```js
export const meta = { id, title, icon, howTo: [html strings] };
export function run({ host, rng, build, hud }) → Promise<{ score: 0–100, detail }>
```

- `host` is the DOM element to draw in. Use `createStage(host)` from `engine.js`.
- `rng` is seeded with `"<date>:<id>"`, so each drill's layout is the same for everyone that day. Generate all layout randomness up front from `rng`. Use `Math.random` only for cosmetics.
- `build` is `{ height (in), weight (lb) }`.
- `hud` exposes `status(text)`, `pips(scores, total)` and `clock(fraction 0–1)`.

To add or reorder drills, edit `CHALLENGES` in `js/main.js`. If you add a new trait, add it to `WEIGHTS` in `comp.js` and to each QB in `qbs.json`.

## Tuning the drills

Every difficulty knob is a constant or a seeded range near the top of each module.

| Drill | Knob | Where |
|---|---|---|
| Arm, tight window | `CATCH_R` (catch tolerance), `BALL_SPEED`, receiver `speed`, window `gap` | `arm.js` `makeTight`, constants |
| Arm, deep ball | `DEEP_CATCH_R` (landing tolerance), `DEEP_BALL_SPEED` (hang time), `DEEP_ROUTES`, receiver `speed`, corner `lag`, `safetySpeed` | `arm.js` constants, `makeDeep` |
| Legs | `DURATION`, spawn speed/interval/types, chaser reaction, hitbox, score formula | `legs.js` `run` |
| Legs, build effects | juke speed, spin cooldown, stride, break-tackle odds | `legs.js` `buildTraits` |
| IQ | shot clock `LIMIT`, scoring, open-man separation, decoy count, box/blocker spread; add a read type by writing a `makeX(rng)` and adding it to `MAKERS` | `iq.js` |

Build effects (shown on the build screen):

- **Lighter** builds juke faster and get a shorter spin cooldown.
- **Heavier** builds break more tackles.
- **Taller** builds get a slightly faster stride and a longer IQ shot clock (they see over the line).
- The Arm drill is pure skill.

## Adding QBs

Append an object to `data/qbs.json`:

```json
{
  "name": "First Last", "era": "2010–2020",
  "height_in": 75, "weight_lb": 220,
  "arm": 80, "legs": 50, "iq": 85,
  "blurb": "One-line scouting take.",
  "bust": false,
  "season": { "year": 2015, "pass_yds": 4000, "pass_td": 30, "int": 10, "rush_yds": 200 }
}
```

- `arm`, `legs` and `iq` (0–100) are subjective ratings. Spread them out: comps are only reachable if some QB sits near a given score combination. Low-rated `"bust": true` entries catch the low scorers.
- `season` is one real season. The projection scales it by how your traits compare to the comp's.
- **Verify statlines** against Pro Football Reference before launch. The current lines were entered from memory, and some rush-yard figures in particular (Leaf, Russell, Manziel, Couch, Clausen, Rivers) need checking.

Matching (`comp.js`) is weighted Euclidean distance over arm, legs and IQ (weight 1.0 each), height (0.45) and weight (0.35), each normalized. Similarity = `100 − distance × 160`, clamped to 40–99.

## Rules we follow

- Names and stats only: no NFL or team logos, team names in the art, player photos or video.
- The deterministic daily seed comes from the local date. Daily #1 = `EPOCH` in `rng.js`.
- The streak lives in `localStorage` (key `quarterwho:v1`), and every access is guarded.
