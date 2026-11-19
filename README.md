# English Quest 🧭

A game-like English learning app for Hebrew-speaking children in grades 2–6 in Israel, with a separate plan per grade that follows the Ministry of Education English Curriculum (2020): oral pre-foundation (grade 2), Foundation Level literacy (grades 3–4) and Band I (grades 5–6, CEFR A1). Several children can share one device, each with their own progress and an optional sign-in code. Children restore **Quest Island** by completing one 10–20 minute quest a day, earn **Quest Tickets**, and send reward requests that only a parent can approve.

## Setup

Requires Node 20+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run test      # unit tests (Vitest)
npm run lint      # ESLint
npm run build     # type-check + production build into dist/
```

On first launch you get onboarding (nickname, grade, avatar, parent PIN). To see a lived-in app immediately, choose **"load a ready-made demo"** on the welcome screen: "Noam" (grade 6, no code) and "Maya" (grade 3, child code `1111`); parent PIN `1234`.

## What is in the app

| Area | Notes |
|---|---|
| Quest Island map | Home screen. Six zones (Word Woods, Grammar Lab, Story Harbor, Sound Cave, Message Market, Bonus Sky) are restored in four stages as matching activities are completed; trails, a bridge, flowers and island friends appear with progress. |
| Daily quest | Warm-up → Learn by playing → Mission challenge → Create & communicate, plus an optional bonus. Estimated time, "nearly done" state, celebration, "You learned…" recap and a peek at the next mission. |
| 13 game types | Match, spell-to-unlock, listen-and-choose, story gaps, sentence bridge (tap / keyboard / drag), sort into crates, reading with tap-the-clue, detective mode (answer + find the evidence), dialogue replies, message builder + typing, free writing with a word meter, scene writer, talk-to-the-guide (optional microphone), speed round (optional, no penalty). |
| Weekly plan | Six seeded weeks × five quests (Mon–Thu + a Boss Mission). One theme, word list and grammar focus run through every activity of the week. Includes a weekly review and a "no such thing as behind" catch-up path. |
| Daily Bonus Adventure | Finishing the day's quest unlocks 5 minutes of **English Gate Racer**: steer a car through the gate with the right answer. Questions come from the child's own grade plan and progress; the time is shared across devices and cannot be restarted. See [docs/bonus-game.md](docs/bonus-game.md). |
| Collections | Word collection (audio, example, optional Hebrew, mastery stars), badges and island progress. |
| Tickets | Ticket pouch, history, Wish Board. A request holds tickets until a parent decides; declining refunds them. |
| Grade plans | Six weeks × five quests for every grade. Grade 2 is listening and speaking only (no reading or typing required, including warm-ups, bonuses and comeback games); grade 3 adds letters, sounds and copying words; grade 4 digraphs, magic e and short texts; grade 5 Band I grammar in context; grade 6 is the original hand-written plan. |
| Several children | "Who is playing?" screen; each child has their own progress, tickets, wishes, settings and plan, and an optional 4-digit code (stored as a salted hash). The 👥 button switches player. |
| Parent area (PIN) | Child switcher; per child: weekly summary with the grade's curriculum stage, strengths and review needs, recent writing, approve / decline / fulfil requests, ticket rules and gifts, weekly plan, **AI report**. Children tab: add, edit (nickname, grade, avatar, daily goal, code) or remove children. Shared reward editor, language, reduced motion, PIN change, data reset. |
| AI report | A Markdown report per child (grade and MoE stage, plan progress, accuracy by skill and grammar topic, words and sentences to review, writing samples) with a ready-made request asking an AI assistant what to focus on. Copy, share (Web Share) or download; the nickname is left out unless the parent includes it. |

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
    bonusGame.ts     Daily bonus game: unlock, play-time allowance, merging across devices
    bonusQuestions.ts Bonus game questions for the child's grade and progress
    parentAuth.ts    PIN hashing, parent session, authorization guard
  data/
    curriculum/      Structured content: week1.ts … week6.ts, grammar labels, authoring helpers
    seed.ts          Initial state, default rewards, deterministic demo data
    repository.ts    AppRepository interface + LocalStorageRepository
  state/store.tsx    React context: loads via the repository, exposes typed actions
  features/          island, quest, activities (games), week, collection, tickets, parent,
                     onboarding, settings, bonus (Gate Racer canvas game + its screens)
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

- No ads, analytics, chat, social feed or leaderboards. Children never have accounts.
- Optional **family account** for the parent only (Supabase, email + password), switched on only when the app is built with Supabase settings — see [docs/supabase-setup.md](docs/supabase-setup.md). Without them the app makes no external requests and everything stays on the device.
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
- **Teacher accounts:** the persisted `Household` already holds several children; a teacher view would be another reader of the same data.
- **More grade content:** add a unit to `data/curriculum/grades/gradeN.ts` — `unit()` in `grades/unit.ts` turns a compact spec into five quests with the activity mix for that grade.

## Saved data and upgrades

Current format: version 3 (adds a version number per child and for the shared part, and random record ids so several devices can be merged later). Version 2 saves upgrade automatically. Each child's progress may also hold `bonusDays` (bonus-game time and results per day); it is optional, so older saves load unchanged. The bonus game also keeps `english-quest/device-id` and `english-quest/bonus-ledger` in local storage (see [docs/bonus-game.md](docs/bonus-game.md)).

Data is stored under `english-quest/state` as a `Household` (version 2): the parent PIN, shared rewards and a list of children. A save from the single-child version (version 1) is upgraded automatically on first load: that learner becomes the first child (grade 6) with every quest, ticket, word stat, badge and request kept, and the original save is copied to `english-quest/state-v1-backup`. Grade 6 lesson ids (`w1d1`…) are unchanged, so the plan continues where it stopped.
- **Writing feedback:** `WriteGame` currently checks length, script and basic punctuation only — a parent or teacher review step (or a moderated checker) could plug in at `onDone`.
