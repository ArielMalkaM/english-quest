# English Quest 🧭

A game-like English learning app for Hebrew-speaking 6th graders in Israel (CEFR A1, Ministry of Education English Curriculum 2020, Band I vocabulary). Children restore **Quest Island** by completing one 10–20 minute quest a day, earn **Quest Tickets**, and send reward requests that only a parent can approve.

## Setup

Requires Node 20+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run test      # unit tests (Vitest)
npm run lint      # ESLint
npm run build     # type-check + production build into dist/
```

On first launch you get onboarding. To see a lived-in app immediately, choose **"load a ready-made demo"** on the welcome screen (child "Noam", parent PIN `1234`).

## What is in the app

| Area | Notes |
|---|---|
| Quest Island map | Home screen. Six zones (Word Woods, Grammar Lab, Story Harbor, Sound Cave, Message Market, Bonus Sky) are restored in four stages as matching activities are completed; trails, a bridge, flowers and island friends appear with progress. |
| Daily quest | Warm-up → Learn by playing → Mission challenge → Create & communicate, plus an optional bonus. Estimated time, "nearly done" state, celebration, "You learned…" recap and a peek at the next mission. |
| 13 game types | Match, spell-to-unlock, listen-and-choose, story gaps, sentence bridge (tap / keyboard / drag), sort into crates, reading with tap-the-clue, detective mode (answer + find the evidence), dialogue replies, message builder + typing, free writing with a word meter, scene writer, talk-to-the-guide (optional microphone), speed round (optional, no penalty). |
| Weekly plan | Six seeded weeks × five quests (Mon–Thu + a Boss Mission). One theme, word list and grammar focus run through every activity of the week. Includes a weekly review and a "no such thing as behind" catch-up path. |
| Collections | Word collection (audio, example, optional Hebrew, mastery stars), badges and island progress. |
| Tickets | Ticket pouch, history, Wish Board. A request holds tickets until a parent decides; declining refunds them. |
| Parent area (PIN) | Weekly summary, strengths and review needs, recent writing, approve / decline / fulfil requests, reward editor (create, edit, pause, remove), weekly cap, bonus multiplier, ticket gifts, child profile, language, reduced motion, PIN change, data reset. |

Feedback is always supportive: first miss → one clue and a retry; second miss → the answer is shown and the item returns on a later day **in a different game format**. Tickets are never removed for mistakes and speed is never rewarded.

## Architecture

```
src/
  domain/            Pure, framework-free logic (unit tested)
    types.ts         Models: LearnerProfile, Lesson, Activity (question types), Skill, WeeklyPlan,
                     ActivityAttempt, TicketTransaction, Reward, RewardRequest, ReviewItem…
    tickets.ts       Balance, earning (cap + multiplier), request / approve / decline / fulfil
    session.ts       completeStep(): attempts, stats, tickets, streaks, session completion
    review.ts        Spaced "comeback" scheduling (Leitner boxes, counted in sessions)
    dailyPlan.ts     Builds warm-ups, comeback games and bonus missions from the week's data
    progress.ts      Unlocking, streaks, island levels, badges, weekly summary
    parentAuth.ts    PIN hashing, parent session, authorization guard
  data/
    curriculum/      Structured content: week1.ts … week6.ts, grammar labels, authoring helpers
    seed.ts          Initial state, default rewards, deterministic demo data
    repository.ts    AppRepository interface + LocalStorageRepository
  state/store.tsx    React context: loads via the repository, exposes typed actions
  features/          island, quest, activities (games), week, collection, tickets, parent,
                     onboarding, settings
  components/        Shared UI (buttons, speech button, avatar, confetti)
  lib/               Speech synthesis / recognition, hash router, text helpers
```

Design choices worth knowing:

- **All content is data.** UI components never contain questions; a new week is one file in `data/curriculum/`.
- **Parent actions are guarded in the domain layer.** `decideRequest`, `fulfillRequest`, `saveReward`, etc. throw `NotAuthorizedError` without a fresh parent session, so the rule holds even if the UI changes.
- **Progression is quest-based, not calendar-based.** The next quest simply waits; streaks use real dates.
- **Hebrew interface, English content.** The document direction follows the interface language; all English content, inputs and game boards are forced LTR. Hebrew help for instructions is opt-in per activity.
- **Accessibility.** Every game works with tap/click and keyboard (drag is an extra), visible focus rings, labelled controls, a skip link, larger-text mode, and reduced motion (system setting or in-app toggle). Listening missions can always show their text; speaking missions never need a microphone.

## Child safety and privacy

- No accounts, ads, analytics, external requests, chat, social feed or leaderboards.
- The only personal data is a nickname and a parent PIN, stored in this browser's `localStorage`. The PIN is stored as a salted hash — a deterrent for the prototype, **not** real security.
- Audio uses the browser's built-in speech synthesis. The optional "say it" button uses the browser's speech recognition where available; some browsers process speech through their own cloud service, so it is never required and can simply be skipped.
- Writing typed by the child is kept locally so a parent can read it in the dashboard.

## Resetting demo data

Parent area (👪 in the top bar) → enter the PIN → **Settings** → **Reset data**:

- **Reset everything** clears local storage and returns to onboarding.
- **Load demo data** replaces everything with the seeded demo (PIN `1234`).

Forgot the PIN in the prototype? Remove the `english-quest/state` key from the browser's local storage.

## Future extension points

- **Backend / accounts:** implement `AppRepository` over HTTP and replace `parentAuth.ts` with server-side auth; the domain functions already take explicit `now` and session arguments.
- **More content:** add `week7.ts…` using the helpers in `data/curriculum/build.ts`; grammar tags live in `curriculum/index.ts`.
- **Recorded audio:** `lib/speech.ts` is the single place to swap synthesis for bundled recordings.
- **Teacher / multi-child:** `AppState` is one learner today; key it by learner id in the repository.
- **Writing feedback:** `WriteGame` currently checks length, script and basic punctuation only — a parent or teacher review step (or a moderated checker) could plug in at `onDone`.
