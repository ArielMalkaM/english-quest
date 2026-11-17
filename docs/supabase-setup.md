# Family accounts with Supabase — setup

The app works without any of this (everything stays on the device). These steps switch on
the parent's family account: register once with email, sign in on every family device.
Syncing the children's progress through the account is the next phase (see the plan at the end).

## 1. Create the project (once)

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
   - **Region:** an EU region (e.g. Frankfurt) is closest to Israel.
   - Save the database password somewhere safe (the app does not need it).
2. **SQL Editor → New query**: paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
   It creates the tables, the "family is created at sign-up" trigger and the security rules
   that keep each family's rows private. Running it again is safe.
3. **SQL Editor → New query** again: paste [`supabase/migrations/002_sync.sql`](../supabase/migrations/002_sync.sql) and **Run**.
   It adds what syncing between devices needs (server timestamps, version guards). Until it runs,
   the Account tab shows "The database needs an update".

## 2. Sign-in settings

In **Authentication**:

- **Sign In / Providers → Email:** enabled, **Confirm email** on. Minimum password length 8.
- **URL Configuration:**
  - **Site URL:** the published app, e.g. `https://arielmalkam.github.io/english-quest/`
  - **Redirect URLs:** add both
    - `https://arielmalkam.github.io/english-quest/**`
    - `http://localhost:5173/**`
- **Emails (SMTP):** Supabase's built-in sender is for testing only and allows very few emails
  per hour. Before real families use it, connect an email service (e.g. Resend: free for
  3,000 emails/month) under *Authentication → Emails → SMTP Settings*, sending from your own domain.
- Optional: edit the *Confirm signup* and *Reset password* email templates (Hebrew text).

## 3. Connect the app

From **Project Settings → API Keys** copy the **Project URL** and the **publishable** key
(`sb_publishable_…`; the legacy `anon` key also works). Never use the `secret`/`service_role` key in the app.

- **Local development:** copy `.env.example` to `.env.local`, fill in both values, restart `npm run dev`.
- **Published site:** GitHub repository → *Settings → Secrets and variables → Actions → Variables* →
  add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then re-run the *Deploy to GitHub Pages* workflow.

## 4. Check it

Parent area → **☁️ Account** tab → *Create an account* → open the email link → the tab shows
"Family is set up in the account". In Supabase, *Table Editor → families* now has one row.

## How syncing works

- Every device keeps a full copy and works offline; syncing only adds to it.
- Tickets and activity history are combined from all devices by id, so nothing earned is lost.
- A wish's status only moves forward (pending → approved/declined → fulfilled), so an old copy never undoes a parent's decision.
- Each child (and the shared PIN/rewards) has a version number. If only one device changed it, that change wins.
  If the same child played on two devices before they synced, completed quests, sessions and badges are combined,
  word/skill counters take the larger value, and the newer profile/settings win.
- Removing a child on one device removes it on all of them.
- First sign-in on a device: no children here → download the family; account empty → upload this device's family;
  both have children → the parent chooses "add this device's children" or "use only the account's".

## Plan

| Phase | Status |
|---|---|
| 1. Supabase schema, security rules, family created at sign-up | ✅ `supabase/schema.sql` |
| 2. Parent account in the app: register, confirm email, sign in, forgot / change password, sign out | ✅ Parent area → Account |
| 3. Data ready for several devices: random record ids, a version (`rev`, `updatedAt`) per child and for the shared part | ✅ saved-data format v3 (older saves upgrade automatically) |
| 4. Sync: load from the account, save changes, offline queue, merge | ✅ `src/sync/` — runs after sign-in, ~2 s after any change, on focus / back online, and every 45 s |
| 5. First sign-in on a device: upload its children, download the account's, or ask the parent when both have children | ✅ Parent area → Account, and "We already have a family account" on the welcome screen |
| 6. Live updates (wishes / approvals) | later |
| 7. Privacy policy, consent text review, delete-account | before public launch |
