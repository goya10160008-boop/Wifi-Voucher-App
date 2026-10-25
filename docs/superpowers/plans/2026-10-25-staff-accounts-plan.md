# Staff accounts and owner activity log: plan and audit

Written for the owner. Status: plan and audit only. Nothing in the app or the database was changed to produce it.

## 1. How staff accounts work today

- **Two tables decide everything.** Supabase's login system (`auth.users`) holds the email and password. The app's own `public.profiles` table says what that person may do: `role` (`owner` or `staff`) and `active` (true or false).
- **A login with no profile row can sign in but sees "No access".** That is the safety default. Nobody gets in just by having an account.
- **Staff can:** see Home, sell vouchers (any plan, up to 10 per sale), see their own sales, open a sale, show and copy a receipt.
- **Staff cannot:** see unsold codes, import codes, edit plans, change settings, void a sale, download the CSV, or see other staff's sales. This is enforced in the database (row-level security) and again in every page and action, not just by hiding buttons.
- **Deactivating** (`active = false`) cuts a person off at once: the app re-reads the profile on every request and the database checks it on every sale. Their open session may live for up to about an hour, but it can do nothing.
- **Sign-ups stay OFF.** If sign-ups were on, a stranger could create an account. They would only see "No access", but there is no reason to allow it. Staff accounts are created by you only.

## 2. Add a staff member today (no code changes, about 3 minutes)

1. Open https://supabase.com/dashboard and open your project.
2. Left sidebar: **Authentication**, then **Users**, then **Add user**, then **Create new user**.
3. Type the staff member's email and a password you choose (at least 8 characters, not a common one). Tick **Auto Confirm User**. Click **Create user**.
4. Left sidebar: **SQL Editor**, **New query**. Paste this with the real email and name, then **Run**:

   insert into public.profiles (user_id, role, display_name)
   select id, 'staff', 'Maria' from auth.users where email = 'maria@example.com';

   It must say **1 row affected**. If it says 0 rows, the email does not match exactly and nothing was added.
5. Check: run `select u.email, p.role, p.display_name, p.active from public.profiles p join auth.users u on u.id = p.user_id;`. You should see your owner row and the new staff row.
6. Give the staff member the app address, their email and the password. Ask them to sign in once while you watch: they should see Home, Sell and Sales only.

**Turn someone off (and back on):**

   update public.profiles set active = false
   where user_id = (select id from auth.users where email = 'maria@example.com');

Use `true` to turn them back on. Check that it says 1 row affected.

**Reset a forgotten password.** The app has no "forgot password" page, so the dashboard's "Send password recovery" email would land on a page that cannot set a password. Use one of these instead:
- Simplest: in **Authentication, Users**, delete the user, create them again (steps 2 and 3) and run step 4 again. Their old sales stay in history but are no longer linked to the new account.
- Keep the same account: in the SQL Editor run
  `update auth.users set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf')) where email = 'maria@example.com';`
  I have not run this on your project. Try it on a throwaway test user first.

**Never** put the Supabase "secret" or "service role" key into the app, a message or git for this.

## 3. Options for an in-app "Staff" page

| | What it is | Secret key needed? | Effort | Risk | Verdict |
|---|---|---|---|---|---|
| **A. Keep manual** | Section 2 | No | 0 | None | Fine for 1 to 5 staff |
| **A+. Manual plus hardening** | Section 4 migration, plus show who sold each code | No | small | Low | **Recommended now** |
| **B-lite. Staff page, no user creation** | Owner-only page listing staff (name, role, active) with a switch to deactivate or reactivate. Creating users stays in the dashboard | No | small to medium | Low | Good next step if you dislike typing SQL |
| **B. Full staff page** | Also creates users and resets passwords from the app via Supabase's Admin API | **Yes** | medium to large | Medium | Not recommended yet |
| **C. Invite by email link** | Staff get an email, click, set their own password | No, but needs email sending and a "set password" page | large | Medium | Poor fit: no such page exists and Supabase's free email sender is heavily limited |

### Why B carries real risk
The Admin API needs the Supabase **secret key**. It can read and change every user and bypass all database rules. If it ever leaked, anyone could create an owner. If B is built:
- The key goes only in a Cloudflare Worker secret: you run `npx wrangler secret put SUPABASE_SECRET_KEY` and paste it when asked, and keep it in `.dev.vars` (git-ignored) for local use. It is never `NEXT_PUBLIC_`, never in git, never in chat.
- It is read only in `lib/supabase/admin.ts`, which starts with `import 'server-only'`, so it cannot be bundled into the browser.
- It is called only from Server Actions that first check `requireRole('owner')`, validate email and name lengths, create `staff` only (never `owner`), and cap how many accounts one action can create.
- You copy the key yourself (Supabase, Project Settings, API Keys, the "secret" key). I cannot and should not fetch it.

### "Username instead of email" variant of B
Staff could sign in with a short name like `maria` while the app quietly stores `maria@ab-wifi.invalid`. Pros: no real mailbox, nothing to confirm, instant creation (the Admin API can mark accounts confirmed). Cons: Supabase insists on an email-shaped address and may reject some domains (not tested), nobody can recover a password by email so you reset it for them, and it needs a custom login form. A later idea, not part of a first build.

## 4. Migration `0003_staff_hardening.sql` (needs your approval before applying)

1. **Fix a small data leak.** The `payments` read policy lacks the "is an active staff member" check that `sales` has (confirmed on the live database). A deactivated staff member could read the cash amounts of their own old sales until their session expires (about an hour). Change it to: owner, or (seller of that sale and an active staff member).
2. **Optional hygiene:** revoke `execute` on the old `sell_voucher` function from signed-in users. The app only uses `sell_cart`, and two sell paths are extra surface.
3. **Only if B-lite is chosen:** an owner-only `set_staff_active(p_user_id uuid, p_active boolean)`. It checks `is_owner()`, refuses to change your own account, refuses to deactivate the last active owner, and writes only the `active` column. The staff list needs no new function because the owner can already read every profile.

No existing row changes. Rollback is replacing the policy with the old one.

**App changes that need no migration:**
- Owner sees **who sold** each sale (display name) on the Sales list, sale page and group page, and a seller column in the CSV. Today the owner cannot tell staff apart.
- Staff Home cards say "Your sales today" and "Your sales this month", and the Sales total says "Your total", because staff only see their own numbers.

## 5. Staff-role audit (read from the code; live database compared with the migration files)

**Live database vs migrations:** policies, column grants, function owners, `search_path` and execute rights match `0001_init.sql` and `0002_sell_cart.sql` exactly. `anon` has no table grants and cannot execute any function. The security advisor shows only the expected "signed-in users can run these functions" notes and "leaked password protection is off" (a dashboard setting).

**What staff can and cannot do**

| Area | Staff result | Where |
|---|---|---|
| Nav | Home, Sell, Sales only | `components/Nav.tsx:20-27` filters owner items |
| Plans, Import, Settings pages and actions | 404 | `requireRole('owner')` in each `page.tsx` and `actions.ts`; `requireRole` calls `notFound()` at `lib/auth.ts:32`. The database also blocks: `plans_insert/update`, `settings_update` and `import_vouchers` are owner-only |
| Void | Not available | page link hidden (`sales/group/[id]/page.tsx:62`, `VoidForm` only for owner on `sales/[id]/page.tsx:44`), `voidSale` is `requireRole('owner')` (`sales/actions.ts:7`), `void_sale` checks `is_owner()` |
| CSV backup | Not available | link hidden (`sales/page.tsx:116`), route owner-only (`sales/export/route.ts:9`) |
| Unsold codes | Never visible | `vouchers_select` is owner-only; staff see a code only on their own sale rows |
| Other staff's sales | Hidden | `sales_select`: owner, or own rows and active staff. Group and sale pages return 404 for someone else's id (ids are random UUIDs) |
| Sell | Allowed | `sell` action `requireRole('owner','staff')`, `sell_cart` checks `has_role` (which includes `active`) |
| Deactivated staff | "No access" in the app, nothing in the database | `getSession` reads the profile with `active = true` (`lib/auth.ts:16-18`), layout shows "No access" (`(app)/layout.tsx:8-17`), `has_role` checks `active` |
| Idle sign-out | Applies to every role | `IdleGuard` mounted in the layout |
| Low-stock banner | Shown to staff with "Tell the owner." | `(app)/page.tsx:34` |

**Findings**

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | The owner cannot tell which staff member made a sale. Rows show code, plan, time and room only (`sales/page.tsx` list, `sales/export/route.ts:25-26`), although `sold_by` is stored | Show seller name (owner sees all profiles) and add a CSV column. No migration |
| 2 | Low | `payments_select` has no active-staff check (live policy confirmed). A deactivated staff member can read the tendered cash of their own old sales for up to about an hour | `0003` policy change (section 4) |
| 3 | Low | Staff see "Today", "This month" (`page.tsx:38-39`) and "Total:" (`sales/page.tsx:79`) with no hint these are only their own numbers (`sales_totals` is correctly security invoker, so it is not a leak) | Relabel for staff |
| 4 | Low | The old `sell_voucher` stays callable by signed-in users (live: execute true). Same checks as `sell_cart`, but a second, untested-by-UI path | Revoke execute (optional) |
| 5 | Policy | Only the owner can void, so a staff mistake needs the owner | Decide in section 9 |
| 6 | Info | A staff session stays valid up to about an hour after deactivation, but it cannot read or sell (checked at the database). Not a problem | None |
| 7 | Info | No staff-management UI and no role editing in the app | Section 3 |

No Critical or High findings. Staff isolation held in every path I read.

## 6. Tests required before any of this ships

Use the local PostgreSQL harness from `docs/decisions.md` decision 16. Add `supabase/tests/rls-staff.test.ts`. Each test runs in a transaction with `set local role authenticated` and `select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)`, so real row-level security applies (the current tests connect as superuser and bypass it). Needs an owner, staff A, staff B, a deactivated staff C, plans, codes and sales for A and B.

- Staff A cannot select from `vouchers` (zero rows) and cannot read B's sales or payments.
- Staff A can read only their own sales and payments, and `sales_totals` returns only their own totals.
- Staff A cannot insert or update `plans` or `settings`, cannot call `import_vouchers` or `void_sale` (`FORBIDDEN`), cannot read other profiles.
- Staff A can call `plan_stock` (counts only) and `sell_cart` (success). A voided code never returns to stock.
- Deactivated staff C gets nothing: no sales, no payments, `sell_cart` fails with `FORBIDDEN`, `plan_stock` returns no rows. The payments case fails before `0003` and passes after (this proves the fix).
- Anonymous (`set local role anon`) is denied on every table and function.
- If B-lite: the owner can deactivate staff, staff cannot call `set_staff_active`, the owner cannot deactivate self or the last owner.

## 7. Owner activity log

### 7.1 What is already recorded, and what is not

**Already stored and simply displayable (no migration):**

| Fact | Stored in |
|---|---|
| Who sold, when, how many, which plan and price, guest and room | `sales.sold_by`, `created_at`, `plan_name`, `price_centavos`, `buyer_name`, `buyer_room`, `group_id` |
| Who voided, when, why | `sales.voided_by`, `voided_at`, `void_reason` |
| Who imported, when, which batch | `vouchers.imported_by`, `imported_at`, `import_batch` (one count per batch can be derived) |
| Cash taken and change | `payments.tendered_centavos`, `created_at` |

**Not recorded at all today:** plan created, edited or archived (only `plans.created_at`, no actor); settings changes (no actor or time); staff added, deactivated or role changed (only `profiles.created_at`); failed logins; successful logins; idle sign-outs and sign-outs; CSV exports; who viewed what. Supabase's own Auth logs show sign-ins and failures in the dashboard (Logs, Auth) but retention on the free plan is very short (about a day), so they are not a history.

### 7.2 Recommended design: an append-only `public.audit_log`

Columns: `id bigint identity`, `at timestamptz default now()`, `actor uuid` (null = done from the Supabase dashboard or SQL editor), `actor_name text` (snapshot of the display name at the time, so it survives renames), `action text` (checked against a fixed list), `target_type text`, `target_id text`, `detail jsonb` (small safe fields only, size-capped by a check), index on `(at desc)` and `(actor, at desc)`.

Rules:
- **Owner-only read.** RLS select policy `is_owner()`. **No** insert, update or delete grants for `anon` or `authenticated`, and `truncate` revoked.
- **Written only by the database:** trigger functions and one RPC, all `SECURITY DEFINER` with `search_path=''`. Triggers read `auth.uid()`, so the existing RPCs (`sell_cart`, `void_sale`, `import_vouchers`) need no rewrite.
- **Tamper resistance:** a `BEFORE UPDATE OR DELETE` trigger raises an exception, so even a bug or a definer path cannot edit history. Be honest about the limit: someone with full database admin access (you, in the Supabase dashboard) can still disable the trigger. This protects against staff and application bugs, not against the database owner.
- **Never log secrets.** Unsold codes are never written to the log. Import logs counts only. Sold and voided codes are masked, for example `***275` (last 3 digits). Guest names stay in `sales`, not in the log.

**Triggers (v1)**

| Table and event | Log action | detail |
|---|---|---|
| `sales` AFTER INSERT (per row) | `sale` | group_id, seq, plan name, price, masked code. The page folds rows with the same `group_id` into one line ("sold 3 vouchers") |
| `sales` AFTER UPDATE when status becomes voided | `void` | masked code, plan, price, reason |
| `vouchers` AFTER INSERT, statement-level with transition table | `import` | plan, count inserted, batch id (one row per import, no codes) |
| `plans` AFTER INSERT / UPDATE | `plan_create`, `plan_update`, `plan_archive`, `plan_restore` | old and new name, hours, price |
| `settings` AFTER UPDATE | `settings_update` | old and new threshold |
| `profiles` AFTER INSERT / UPDATE | `staff_add`, `staff_deactivate`, `staff_reactivate`, `role_change` | name, role. Done from the SQL editor, so the actor is null and shown as "Supabase dashboard" |

Per-row sale triggers produce one log row per voucher. At ~100 sales a day that is trivial. A cart of 10 gives 10 rows that the page folds into one sentence.

**Logins and idle sign-outs (v2).**
- Supabase's own Auth logs are **not enough** (about a day of history).
- Add an RPC `record_event(p_action text, p_detail jsonb)`, `SECURITY DEFINER`, granted to `authenticated` only (never `anon`, to avoid log flooding). It checks `has_role(owner, staff)` (so deactivated users cannot write), accepts only the fixed allow-list `login`, `logout`, `idle_signout`, `csv_export`, caps `detail` to a few hundred bytes, and rate-limits to about 60 events per actor per hour.
- Call it from the existing server actions: `login` right after `signInWithPassword` succeeds, `idleLogout` and `logout` before signing out, and the CSV route.
- **Failed logins** are deliberately not stored by the app: recording them would need an unauthenticated write path, which is a spam and abuse risk, and an attacker's attempts cannot be trusted as attributable. Use the Supabase Auth logs for that if ever needed.
- **Who viewed what** is not recommended (noisy, privacy-heavy, low value).

### 7.3 Owner screen

- `/logs`, owner only (staff get 404 via `requireRole('owner')`), reached from **Settings** and a card on Home. It does not go in the bottom nav, which already holds six items for the owner.
- Filters in the same compact pattern as the Sales page: From and To side by side, quick ranges (Today, 7 days, This month, Last month), a person selector and an action-type selector (Sales, Voids, Imports, Plans, Settings, Staff, Sign-ins).
- 50 rows per page, newest first (`at desc, id`), short Manila timestamps (`lib/short-time.ts`), big touch targets, Mint classes only.
- Plain sentences from a pure, unit-tested `describeEvent(row)`: "Maria sold 3 vouchers (₱60.00) at 3:42 PM", "Owner voided sale ***275 (3HRS WIFI): wrong plan", "Owner imported 56 codes into 3HRS WIFI", "Owner changed 3HRS WIFI price ₱10.00 to ₱15.00", "Supabase dashboard added staff Maria".
- A "Today by person" card at the top (sales count and ₱ total per seller) computed from `sales` with owner-only access, so it needs no audit rows.
- CSV export of the log: optional, later.

**Retention and size.** At about 100 events a day and ~0.4 KB per row with indexes, the log grows about 15 MB a year, against 500 MB on the free database plan. No purge is needed in year one. If wanted later: a `purge_audit_log(older_than)` function that is the only thing allowed past the delete-blocking trigger, run by you from the SQL editor.

### 7.4 Migration and tests for the log

- **`0004_audit_log.sql`:** the table, its check constraints, the RLS policy, the trigger functions and triggers above, the update/delete-blocking trigger, and (v2) `record_event`. Existing rows are not backfilled automatically. Optional backfill: one-time insert of past sales, voids and imports from the columns that already exist (read-only copy, no code values), so history starts at day one.
- **Tests on the local harness, with real `authenticated` role:**
  - Owner can select the log. Staff select returns 0 rows. Anon is denied. Nobody can insert, update or delete (permission denied), and a superuser update or delete is blocked by the trigger.
  - Selling as staff A writes a `sale` row with actor A, the right name snapshot and a masked code. A cart of 3 writes 3 rows sharing a `group_id`.
  - Voiding writes a `void` row with the reason and masked code. An import writes exactly one row with the count and no codes.
  - Plan, settings and profile changes write the expected diff. A change made with no JWT (SQL editor) logs actor null.
  - No unsold code and no full sold code appears anywhere in `audit_log.detail`.
  - v2: `record_event` rejects names outside the allow-list, is denied to anon and to deactivated users, caps size, and enforces the hourly limit.
  - The existing concurrency and cart suites still pass with the triggers installed (sales must not slow or deadlock).

### 7.5 Smallest useful first version

- **v1:** `0004_audit_log.sql` with the table and the triggers (sales, voids, imports, plans, settings, staff changes), the `/logs` page with filters and sentences, the "Today by person" card, and the tests. Delivers who sold, who voided, who imported and who changed prices and staff, which is the accountability the owner wants.
- **v2:** `record_event` and the login, logout, idle sign-out and CSV-export events.
- **Later, only if wanted:** log CSV export, purge function.

## 8. PIN login for everyone (owner and staff)

Updated requirement: everyone may sign in with a PIN, the owner too. Planning only.

### 8.1 The honest trade-off
A PIN is weaker than a password: 6 digits are 1,000,000 combinations, 8 digits are 100,000,000, and a PIN is typed on a screen where someone can watch. The two accounts carry very different risk:
- **A staff PIN stolen:** the thief can sell vouchers, and every sale shows them the code. They could sell, give away or pocket cash for up to the whole unsold stock. They cannot see the stock list, void, import, export or change anything.
- **The owner PIN stolen:** the thief can do everything: void, import, export, change prices, see unsold codes, add staff.

So the design rule is: **a PIN is a fast daily sign-in, not the key to the safe.** The owner keeps email and a strong password as the admin and recovery path, and the sensitive actions need that password.

### 8.2 How a PIN fits Supabase
Supabase Auth only understands email and password (minimum password length is a setting, default 6; I did not check yours). Three ways:
- **PIN-A: the PIN is the Supabase password.** Easy, but Supabase's login address is public (the app key is public), so anyone can try PINs against it directly and skip any lockout we write. Only Supabase's own per-address rate limits protect it (our logins come from Cloudflare's addresses; I have not checked your limits). **Not recommended, and far too weak for the owner.**
- **PIN-B (recommended): we check the PIN, Supabase's password is a long random value nobody knows.** The PIN exists only as a bcrypt hash in our own table. One database function checks it, counts failures and applies the lockout in a single locked step. Only after a correct PIN does the server ask Supabase for a one-time sign-in link for that user and use it at once to start the normal session (no email is sent). The lockout is real because there is no other way in. Needs one Worker secret (the Supabase secret key) and a half-hour spike to prove it works on your project.
- **PIN-C: peppered password.** Supabase's password is a code made from username, PIN and a server secret. Similar strength, but two secrets, and a leaked secret drops it back to PIN-A. Considered, not chosen.

### 8.3 Recommended design at a glance

| | Staff | Owner |
|---|---|---|
| PIN length | 6 digits | **8 digits** |
| Wrong tries | 5, then locked 15 minutes. A second lockout within 24 hours locks it until the owner unlocks | **3**, then locked 30 minutes. A second lockout switches the PIN off until the owner signs in with email and password |
| What a PIN sign-in gives | A normal staff session | A **"daily" owner session**: sell, read all sales, totals, the activity log and receipts. **No sensitive actions** |
| Sensitive actions | Not allowed to staff anyway | Need a **password sign-in within the last 30 minutes** |
| Idle sign-out | 5 minutes | 15 minutes |
| Who resets the PIN | The owner (from a full session) | Only the owner, from a password session, or you in the Supabase dashboard. Nobody else |
| Switched on by default | Once the owner sets it | **Off** until the owner sets one in Settings |

**Sensitive actions** (enforced in the database wherever possible): void a sale, import codes, create or edit or archive plans, change settings, read the unsold codes table, set or reset or unlock PINs, add or deactivate staff, and CSV export (the database cannot tell an export from a normal read, so that one is enforced in the app only).
**Daily actions:** sell, view sales and totals, receipts, view plans, read the log.
**Honest limit:** a PIN-owner session can still read all sales (guest names, rooms, cash) through the API, and read the log.

### 8.4 How "password in the last 30 minutes" is known
Supabase puts a list of sign-in methods with their times into the session token (called `amr`). A password sign-in records "password" and the time. A one-time-link sign-in, which is what our PIN path uses, records a different method. A new database function `is_full_owner()` means: active owner and a password sign-in in the last 30 minutes. The sensitive policies and functions use it instead of `is_owner()` (a small migration, `0006`).
- When the owner taps a locked item (Plans, Import, Settings, Staff, Void, CSV), the app shows "Enter your password to unlock admin". The password is checked with a normal password sign-in, which replaces the session, so the owner stays in the app and is full for 30 minutes.
- A password-first owner who opens the app at 8am and wants to void at 3pm is asked for the password again. That is the price of the rule, and it is intended.
- **Defence in depth:** even if a bug in the PIN path ever created an owner session by mistake, that session would still be "daily" and could not void, import or see unsold codes.
- I have not verified that your project's tokens carry this list or that a one-time-link sign-in is recorded differently. The spike checks it. Fallback: a small table `owner_elevations` keyed by the token's session id, filled by the password step-up.

### 8.5 Login screen: one unified screen, not a separate staff tab
- One screen: a **username** box, a large number keypad (keys at least 56 px, `inputMode="numeric"`, dots that fill as you type, lower half of the screen, one thumb), a **Sign in** button, and a link **"Use email and password instead"** that opens today's form (the owner's admin and recovery path).
- No auto-submit on the last digit, because staff PINs are 6 digits and the owner's are 8. The box accepts 6 to 8 digits and the server decides.
- **No list of names** on the login page: a public list tells strangers who works for you. People type a short username (for example `maria`). Pick an owner username that is not `owner` or `admin`. The phone remembers the last username (never the PIN).
- One generic error for every failure: "Wrong username or PIN, or the account is locked. Ask the owner."
- **Why unified:** the owner signs in every day, a second tab is one more tap, and two forms are two things to keep working. A separate staff tab would also hint that the owner is the other tab.

### 8.6 PIN rules, lockout and storage
- **Never fewer than 6 digits.** Blocked: one repeated digit, straight runs up or down (123456, 654321, 012345), repeated short blocks (121212, 123123). The app can generate a random PIN to read out once. The rules are enforced inside the database function, not only in the form.
- **Staff attack maths:** 5 tries per 15 minutes is about 480 tries a day, roughly 3 years to cover half of 1,000,000, and the second-lockout rule cuts it to about 10 a day plus a phone call to you.
- **Owner attack maths:** 8 digits, 3 tries, then a hard switch-off after the second lockout, so an attacker gets at most 6 tries before the PIN is off and you are told. 6 tries out of 100,000,000 is a negligible chance.
- **Lock-out vandalism:** anyone can lock a username by typing wrong PINs. For staff you unlock them. For the owner it only switches the PIN off: you use your password, which clears it, and the next login shows a red note "Your PIN was locked after wrong tries at 3:42 PM". Accepted for v1; the trusted-device step below removes it.
- **Storage:** only a bcrypt hash in `user_pins`, which no app user can read (even you); only the functions touch it. The PIN is never saved in plain text, logged or put in a link. Next.js prints server action arguments in the development console, so the PIN travels in form data (printed as an empty object), not as a plain argument. Honest limit: any 6- or 8-digit secret can be recovered fast from its hash if the table itself leaked, so the table stays readable by the functions and database admins only.
- **A PIN can only open the account it belongs to,** the account must be active, and the verify step re-reads the role every time.

### 8.7 "Trusted device" idea (password once, then PIN on that phone only)
- **What:** after a password sign-in the owner taps "Trust this phone". The server stores a random device token (hashed) in `trusted_devices` and sets a secure cookie for about 90 days. The owner PIN works only when that cookie is present.
- **Effect:** remote guessing and the lock-out vandalism disappear, because without the cookie no attempt is even counted. A thief needs the phone and the PIN.
- **Cost:** one table, cookie handling in the Worker, a "My devices" list with revoke and "sign out everywhere", plus tests. About one day. Supabase itself needs nothing special, because we still create the session the same way.
- **The alternative** (leave the Supabase session logged in for weeks and use the PIN as a lock screen) is not recommended: a lock screen in the browser is cosmetic, and a thief holding the phone already has the live session.
- **Verdict:** worth building for the owner as **v2**: it is what makes an owner PIN comfortable on the open internet. Optional for staff (registering the shop phone so staff PINs only work there; it adds control but blocks staff using their own phones). Until then the 8-digit PIN, hard lock and limited session are the defences.

### 8.8 What goes in the activity log
`pin_set`, `pin_reset` (with who did it), `pin_login` (owner or staff), `pin_login_failed` (first failure per window with the count, real usernames only), `pin_locked`, `pin_unlocked`, `step_up` (password unlock of admin succeeded), `sensitive_denied` (a daily session tried a sensitive action), `staff_deactivated`. **Never** the PIN or a guess. Unknown usernames are not logged one by one, so the log cannot be flooded. Builds on the audit log in section 7 (migration `0004` first).

### 8.9 Pieces needed
**Migration `0005_user_pins.sql`:** table `user_pins` (user id, lowercase username 3 to 20 characters unique, bcrypt hash, PIN length, failed count, lockout count, locked until, set at, set by) with row security on and no grants to anyone. Functions, all `SECURITY DEFINER` with `search_path=''`:
- `set_user_pin(user, username, pin)`: needs a full owner. Applies the length rule for the target's role, the blocked patterns, hashing, resets counters. An owner may set their own PIN only from a full session.
- `unlock_user_pin(user)`: needs a full owner.
- `user_pin_verify(username, pin)`: executable **only by `service_role`**. Atomic with a row lock, uses the role-specific limits, compares against a dummy hash for unknown usernames to even out timing. Returns ok, user id, locked-until and the role.
- `user_pin_status()`: list for the owner page (username, locked-until, set-at), never a hash.

**Migration `0006_full_owner_gating.sql`:** `is_full_owner()`, then the sensitive policies and functions (`vouchers_select`, `plans_insert/update`, `settings_update`, `void_sale`, `import_vouchers`, the PIN and staff functions) switch from `is_owner()` to `is_full_owner()`. Existing data is untouched. Rollback is switching them back.

**App:** `lib/pin.ts` (rules and a random PIN generator using `crypto.getRandomValues`), `lib/lockout.ts` (the lockout rules as a pure function, used as the test vectors and for wording), `lib/supabase/admin.ts` (server-only), the `pinLogin` server action (form data, strict validation, one error for everything), the unified login screen and keypad component, the "unlock admin" password prompt, the owner `/staff` page and Settings "My PIN", a `requireFullOwner()` helper for the CSV route and sensitive pages, and `IdleGuard` limits per role.

**Worker secret (you do this; I never see the key).** Only needed at build and deploy.
1. Supabase dashboard, Project Settings, API Keys. Copy the **secret** key (starts `sb_secret_`). Do not paste it in chat.
2. Locally add `SUPABASE_SECRET_KEY=...` to `.env.local` (git-ignored).
3. Live: in the project folder run `npx wrangler secret put SUPABASE_SECRET_KEY`, paste, Enter. Or Cloudflare dashboard, Workers and Pages, `ab-wifi-vouchers`, Settings, Variables and Secrets, Add, type **Secret**.
4. Never `NEXT_PUBLIC_`, never in git.

**Rules for that key in code:** `lib/supabase/admin.ts` begins with `import 'server-only'`, is used only inside `pinLogin` after the verify function says the PIN is right, and in full-owner-gated actions, and is never sent to the browser. `pinLogin` runs before anyone is signed in and can now start an owner session, so that code stays tiny and gets its own review.

### 8.10 Tests
**Pure unit tests first:** PIN rules for 6 and 8 digits (about 40 cases each way), random PIN generator always valid (1,000 samples), lockout vectors per role (exact boundaries, second lockout, hard lock, success resets, expiry), the "sensitive action needs a recent password" rule as a pure function, idle limits per role.

**Local database harness with real roles:**
- `user_pins` is unreadable and unwritable to `anon` and `authenticated`, even the owner. `user_pin_verify` is denied to both and allowed to `service_role`.
- `set_user_pin` rejects trivial or wrong-length PINs, wrong role lengths, missing users and non-owners, and refuses an owner PIN from a daily session.
- 20 parallel wrong tries leave exactly one lockout and a count at the limit, not beyond.
- A correct PIN while locked still fails; after the time passes it works; success resets. Deactivated users fail. The owner PIN's hard lock holds until a password sign-in clears it.
- **Session level:** with claims showing a recent password sign-in, `void_sale`, `import_vouchers`, plan and settings writes and `vouchers` reads succeed. With only a one-time-link sign-in, an old password time (over 30 minutes), or no method list, they are denied. `sell_cart`, sales reads and the log still work in a daily session. Staff behaviour is unchanged.
- The same lockout vectors run against the SQL function and must match the pure rules. No audit row contains a PIN, and no function returns a hash.

**Manual spike (needs your approval, not part of the automatic tests):** on a throwaway user in your Supabase project, prove that (1) generating a one-time link and redeeming it creates a normal session that `getClaims()` accepts under our Next.js and OpenNext setup, and (2) the token's method list differs between a password sign-in and that session. This writes a test user to your Auth system and is deleted afterwards. If (2) fails, use the `owner_elevations` fallback. If (1) fails, use PIN-C.

### 8.11 Recommendation and smallest first version
Recommend **PIN-B with the unified screen**, 6 digits for staff and 8 for the owner, owner PIN off until set, and sensitive actions gated on a recent password.
- **v1a (about 2 days): staff PINs.** The spike, `0005`, the libraries, `pinLogin`, the unified login screen, the owner Staff page (set or reset a staff PIN, unlock, deactivate, reactivate, locked status), staff idle 5 minutes, log events. Staff accounts are still made by hand in the Supabase dashboard (any long random password, since they never use it) plus the profile row from section 2, then you set the PIN in the app. The owner keeps email and password.
- **v1b (about 1 more day): owner PIN.** `0006` and the full-owner gating, the "unlock admin" password step, Settings "My PIN", the owner limits (8 digits, 3 tries, hard lock), the red "your PIN was locked" note. Do not switch the owner PIN on until `0006` is live and tested.
- **v2:** trusted device for the owner, staff changing their own PIN, creating staff from the app (reuses the secret), a human check (Cloudflare Turnstile) after 3 failures, optional shop-network or opening-hours rules, and a cap such as 40 vouchers per staff member per hour to limit damage from a stolen login.
- **Needs your approval:** the throwaway-user spike, adding the Worker secret yourself, applying `0003` to `0006`, and deploying.

## 9. Task list and approvals

| # | Task | Estimate | Needs your approval |
|---|---|---|---|
| 1 | Add the first staff member by hand (section 2) | 3 min, you | no |
| 2 | `rls-staff.test.ts` on the local database against the current migrations (should show only the payments gap) | 2 to 3 h | no |
| 3 | `0003_staff_hardening.sql` plus passing tests | 1 to 2 h | **apply to the real database** |
| 4 | Show who sold, "Your sales" wording, CSV seller column | 2 h | **deploy** |
| 5 | Audit log v1: `0004` migration, triggers, tests | 3 to 4 h | **apply to the real database** |
| 6 | `/logs` page, `describeEvent`, "Today by person", links from Settings and Home | 3 to 4 h | **deploy** |
| 7 | Audit log v2: `record_event` and login, logout, idle and CSV events | 2 to 3 h | **apply**, **deploy** |
| 8 | B-lite staff page (list, deactivate, reactivate) | half a day | **apply** (`set_staff_active`), **deploy** |
| 9 | Create staff users from the app (reuses the PIN secret) | 1 day | **apply**, **deploy** |
| 10 | PIN spike: one-time-link sign-in on a throwaway user, and what the token's method list shows for password versus link sign-ins | 0.5 h | **a throwaway user in your Supabase project**, and the Worker secret for local testing |
| 11 | `0005_user_pins.sql` plus lockout and RLS tests (staff and owner rules) | 3 to 4 h | **apply to the real database** |
| 12 | `lib/pin.ts`, `lib/lockout.ts`, `pinLogin`, unified login screen and keypad | 4 to 5 h | **Worker secret (you)**, **deploy** |
| 13 | Owner `/staff` page (set or reset PIN, unlock, deactivate, reactivate); replaces task 8 | 4 h | **deploy** |
| 14 | Per-role idle limit (staff 5 min, owner 15) | 0.5 h | **deploy** |
| 15 | **Owner PIN (v1b):** `0006_full_owner_gating.sql` plus session-level tests, "unlock admin" password step, Settings "My PIN", red "PIN was locked" note | 1 day | **apply to the real database**, **deploy** |
| 16 | **Trusted device for the owner (v2):** device token table, cookie, "My devices" and revoke | 1 day | **apply**, **deploy** |

Suggested order: 1, 2, 3, 4, 5, 6 together as one release (about 1.5 days of agent time), then 7. Then the PIN login: 10, 11, 12, 13, 14 as release v1a (staff PINs, about 2 days), then 15 as v1b (owner PIN, about 1 more day). Do not switch on an owner PIN before 15 is live. Task 16 comes later. Task 8 is not needed if the PIN release is built, and task 9 only if staff change often.

## 10. Questions for you

1. How many staff, and do they change often? (1 to 5 and stable: stay manual.)
2. Should staff be able to **void their own mistakes**? Today only you can.
3. Is **v1 of the log** (sales, voids, imports, plan and settings changes, staff changes, plus the Logs page) enough to start, with login events later?
4. Do you want the log to start empty from the day it is applied, or backfilled with past sales, voids and imports?
5. PIN login: are 6 digits acceptable for staff and 8 for you (4 digits are not recommended)?
6. Do you accept that with a PIN sign-in you must type your password to void, import, change plans or settings, manage staff or export (it stays good for 30 minutes)? This is the main price of an owner PIN.
7. Is a 5-minute idle sign-out for staff acceptable (you keep 15)?
8. Are you willing to add the Supabase secret key to Cloudflare yourself (steps in section 8.9)? Without it the PIN design falls back to the much weaker PIN-A, which I do not recommend, especially for the owner.
9. Should you assign each username, or should staff choose theirs (typed, never listed on the login page)?
10. Do you want the owner PIN in the first release, or staff PINs first and the owner PIN a day later (recommended)?
