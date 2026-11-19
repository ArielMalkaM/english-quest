# Daily Bonus Adventure (English Gate Racer)

A 5-minute reward game that unlocks once a child has finished a whole quest on the current day.
The child drives a car down a road; each English question sends a row of 2–3 gates towards the
car, and whichever lane the car is in when the gates arrive is the answer. Wrong answers never
stop the car: the right gate turns green and the explanation from the lesson is shown.

The race is drawn in **3D with Three.js** (chase camera behind the car, gate arches with sign
panels, spinning coins, emoji scenery and a sky per stage). Devices without WebGL get the same
game as a flat **2D** canvas view.

## Where the code lives

| File | What it does |
|---|---|
| `src/domain/bonusGame.ts` | Unlock rules, statuses, recording play time and results, merging records (pure, tested) |
| `src/domain/bonusQuestions.ts` | Builds the question deck for the child's grade and progress (pure, tested) |
| `src/features/bonus/session.ts` | What the screen shows when opened (`planEntry`) and the running game's clock/score (`BonusRun`) |
| `src/features/bonus/raceSim.ts` | The race rules, independent of drawing: lanes, gates, timing, scoring, coins, stages |
| `src/features/bonus/gateRacer.ts` | Game loop: advances the rules, charges play time, hands each frame to the view |
| `src/features/bonus/views.ts` | Picks the view: 3D when WebGL works (Three.js loaded on demand), else 2D |
| `src/features/bonus/view3d.ts` | Three.js view: camera fitting, car, gate arches, coins, scenery, effects |
| `src/features/bonus/view2d.ts` | Flat 2D canvas view (fallback) |
| `src/features/bonus/labels.ts` | Gate panels and labels, drawn with the canvas API (2D gates and 3D sign textures) |
| `src/features/bonus/ledger.ts` | Browser-wide tab guard and the per-device id |
| `src/features/bonus/BonusGame.tsx` | `#/bonus` screen: tutorial, HUD, question panel, pause, summary |
| `src/features/bonus/BonusPrompt.tsx` | "You unlocked it" pop-up and the "bonus is waiting" banner |
| `src/state/store.tsx` | Actions `bonusPrompted()` and `bonusCheckpoint(date, checkpoint)` |
| `src/sync/merge.ts` | `mergeProgress` combines `bonusDays` when two devices changed the same child |

## Rules

- **Unlock:** a `SessionRecord` (a quest with all four required steps done) whose `date` is today's
  local date. Practice replays and the optional bonus step never create one. No quest finished
  today → no bonus. Several quests in one day → still one bonus.
- **Day boundary:** the device's local date (`dates.localDate`), the same rule streaks and sessions
  use. A quest finished at 00:05 belongs to the new day. Time zones and daylight-saving changes
  follow the device clock.
- **Pop-up:** shown once per day, on any page except Parent area and Settings, the first time the
  app sees the bonus unlocked. Play now / Play later / Esc all record `promptedAt`, so it never
  comes back that day. Starting a game also counts as answered.
- **Allowance:** 5 minutes of *active* play per day, shared by all devices. The clock stops when
  paused, when the tab or app is hidden, and while frames are frozen (at most 250 ms is charged
  per animation frame, and that is exactly the time the game simulated).
- **End of day:** the allowance lapses at local midnight. A game paused (or left open) across
  midnight ends with "yesterday's bonus time ended" — no finish bonus, no extra time recorded.
- **Not restartable:** once the 5 minutes are used (`finishedAt` or `usedMs ≥ 5 min`) the screen
  shows the day's results instead of a game.

## Saved data

`Progress.bonusDays` (optional, so older saves load unchanged), keyed by local date, newest 30 days:

```ts
BonusDay {
  date, promptedAt?, startedAt?, finishedAt?,
  usedMs, score, correct, answered, coins, bestStreak,   // day totals
  parts?: { [deviceId]: { usedMs, score, correct, answered, coins, bestStreak } }
}
```

Each device writes only its own `part`. Merging (another save, tab or device) takes the larger
value of each field per device and recomputes the totals as the sum of all parts — never lower
than either record already said. So:

- a refresh, a stale or replayed checkpoint, or a repeated sync can never lower time used or
  raise results twice;
- a phone and a tablet (even both offline) add up to one shared 5 minutes.

The family account stores this inside the child's `progress` JSON; no database migration is needed.

### Device id and tab ledger (browser storage)

- `english-quest/device-id` — a random id per browser, used as the key of the device's part.
- `english-quest/bonus-ledger` — per child and day: time used, finished flag, which tab is
  playing and a heartbeat. Written every second while playing (the child record is saved every
  10 s, on pause, on hide and on page unload). It lets a refreshed page resume with time that was
  played after the last save, and blocks a second tab ("The game is open in another window")
  while the first one is alive. A tab that is hidden or unloading releases its claim at once.

## Questions by grade

Built from the child's own plan: words of the weeks they have reached (only words already met in
quests once there are at least six), and grammar / dialogue items from quests they have finished.

| Grade | Question types | Seconds per gate |
|---|---|---|
| 2 (oral) | hear/see an English word → picture gate (spoken automatically when sound is on) | 7.5 |
| 3 | Hebrew + picture → English word; English word → picture | 7 |
| 4 | + complete a sentence with a word, grammar choices | 6.5 |
| 5 | Hebrew → English, sentence gaps, grammar choices, "choose the right reply" | 6.2 |
| 6 | same mix as grade 5, more grammar | 6 |

- Picture gates show the picture **and its Hebrew word**, like the app's listening games, so
  abstract words (days, school subjects) are unambiguous.
- Rounds: every available question is asked once before any repeats; the same question (or the same
  word asked another way) never comes twice in a row.
- Reinforcement: up to four words the child often gets wrong (accuracy below 60% after 2+ tries)
  come first in each round; this week's words are weighted to come earlier.
- Distractors are other real words of the same week where possible, never sharing the answer's
  English, Hebrew or picture. Gate text is limited to 24 characters (26 for replies).

## Scoring

| Event | Points | Coins |
|---|---|---|
| Right gate | +10, plus +5 per answer in a row after the first (max +20 extra) | +5 |
| Coin on the road | — | +1 |
| Playing all 5 minutes | — | +20 (once) |
| Wrong gate | 0 (no penalty, streak resets) | — |

Coins and points are **game-only**: they are stored in `bonusDays` and shown in the summary, but
never create Quest Tickets (tickets buy real rewards and stay under the parent's rules).

## 3D view

- **Library:** `three` 0.187.0 (pinned). `view3d.ts` is loaded with a dynamic `import()`, so Vite
  puts Three.js in its own file (about 140 KB gzipped) that is downloaded only when the bonus game
  opens; the rest of the app is unchanged in size.
- **Choosing the view:** `views.ts` checks WebGL on a throw-away canvas, then creates the 3D view on
  a fresh canvas; if WebGL is missing or the 3D view fails to start, the 2D view is used on another
  fresh canvas (a canvas cannot switch from WebGL to 2D). The start button says "Loading the race…"
  until a view is ready.
- **Troubleshooting switch:** set `localStorage['english-quest/bonus-renderer']` to `"2d"` (or `"3d"`)
  to force a view on one device.
- **World:** lanes are 2.4 units wide; a row of gates appears 18 units ahead (`ROAD_LEN`) and reaches
  the car after the grade's gate time, exactly as in 2D (the rules live in `raceSim.ts`).
- **Camera:** `placeCamera()` moves the chase camera back until the whole three-lane road and the
  back of the car fit the screen, with a wider field of view on tall phones. Tested for six screen
  shapes from a small phone to a wide desktop.
- **Readability:** far signs are smaller in perspective, so in 3D the question panel also shows the
  answers as chips in lane order and in the gates' colours; each gate also paints a stripe in its
  colour across its lane on the road.
- **Taps:** a tap on a sign picks that sign's lane; elsewhere the lane under the finger on the road;
  above the horizon, the left / middle / right part of the screen.
- **Performance:** one draw call per object, shared geometries and materials, instanced particles,
  canvas textures cached and disposed when gates leave. If frames stay slow the view lowers its
  resolution to 1× automatically. Everything is disposed (including the WebGL context) when the
  game screen closes.

## Accessibility and devices

- Steering: ◀ ▶ buttons (64 px tall), tapping a lane on the road, arrow keys or A/D. P or Esc pauses.
- First-time tutorial asks the child to move the car once before the race starts.
- The question panel is an `aria-live` region and lists the gates for screen readers; the timer
  has a spoken label; the HUD stays left-to-right inside the Hebrew interface.
- All text meets WCAG AA contrast (gate colours are checked in `gateRacer.test.ts`).
- Reduced motion: no confetti, screen shake or exhaust; fewer particles. Large text: the HUD scales
  with the screen width so it never overflows a phone.
- Performance: no image files (all textures are drawn at runtime); a frame takes about 0.4 ms of
  script time in 3D and 0.3 ms in 2D in a desktop browser. Gate label layout is measured once and
  cached.

## Tests

| File | Covers |
|---|---|
| `src/domain/bonusGame.test.ts` | Unlock via real quest steps, pop-up once, midnight / time zone / DST, monotonic recording, multi-device merging |
| `src/domain/bonusQuestions.test.ts` | Every grade at several progress points: valid questions, correct answers checked against the curriculum, on-level content, no repeats, reinforcement |
| `src/features/bonus/session.test.ts` | Opening the screen, countdown, scoring, refresh / close / resume, restart attempts, handing over to a second device |
| `src/features/bonus/ledger.test.ts` | Second-tab guard, release on unload, corrupt or blocked storage, device id |
| `src/features/bonus/gateRacer.test.ts` | Game loop + rules through the 2D view on a stub canvas: lanes and answers, gate timing, streaks, tap/keyboard steering, time charging, coins, contrast |
| `src/features/bonus/view3d.test.ts` | 3D layout maths (real Three.js, no WebGL needed): lanes, camera framing and gate visibility / sign size on six screen shapes |
| `src/sync/bonus.sync.test.ts` | Two devices through the in-memory family account: unlock and pop-up sync, shared allowance, offline play on both, idempotent sync, no tickets |

## Known limits

- There is no server-side game authority (the app is local-first). The rules hold for anything the
  app does; someone editing browser storage by hand could reset a device's record — which would
  also reset all of that child's progress on a device that is not synced.
- Results answered in the last few seconds before a browser crash (not a normal refresh or close,
  which save immediately) can be lost; time used is never lost because the ledger is written every
  second.
