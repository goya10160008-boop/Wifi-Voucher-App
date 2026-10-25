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

## 8. Staff PIN login

Owner requirement: staff sign in with a PIN, and the owner keeps email and password. Planning only.

### 8.1 The honest trade-off
A PIN is weaker than a password. Six digits are 1,000,000 combinations. That is acceptable here only because of what a staff login can do and because of the extra locks below. Be clear about the worst case: a staff login can sell vouchers, and every sale shows the code to whoever is holding the phone. Someone who guessed a staff PIN could sell, give away or pocket cash for up to the whole unsold stock. They could not see the stock list, void, import, export or change anything. That is the residual risk. Everything below shrinks it; none of it removes it.

### 8.2 How a PIN fits Supabase
Supabase Auth only understands email and password. Its minimum password length is a setting (default 6; I did not check your project's value). Three ways to fit a PIN in:

- **PIN-A: the PIN is the Supabase password** (with a made-up email such as `maria@staff.ab-wifi.invalid`). Easiest, no secrets. The catch: Supabase's login address is public (the app key is public), so anyone can try PINs against it directly and skip any lockout we write. Only Supabase's own rate limits would protect it. Those count per internet address, our logins come from Cloudflare's addresses, and I have not checked the limits on your project. Any lockout we added would be for show. **Not recommended.** Also, `.invalid` addresses may be rejected by Supabase (untested).
- **PIN-B (recommended): we check the PIN, Supabase's password is random.** Each staff member's real Supabase password is a long random value that nobody knows, so Supabase's public login cannot be guessed. The PIN exists only in our own table as a bcrypt hash. One database function checks it, counts the failures and applies the lockout in a single locked step. Only after a correct PIN does the server ask Supabase for a one-time sign-in link for that user and use it immediately to start the normal session (no email is sent). The lockout is real, because there is no other way in. It needs one Worker secret (the Supabase secret key) and a half-hour spike to prove the one-time-link step works on your project.
- **PIN-C: peppered password.** The Supabase password is a code computed from the username, the PIN and a server secret. Similar strength and no admin call at login, but two secrets, and a leaked secret drops it back to PIN-A. Considered, not chosen.

### 8.3 Login screen
- `/login` gets two tabs: **Owner** (the current email and password form, unchanged) and **Staff**.
- **Staff tab:** a username box and a large number keypad (keys at least 56 px, digits 0 to 9, backspace, six dots that fill as you type, `inputMode="numeric"`, in the lower half of the screen for one thumb). It submits by itself on the sixth digit.
- **Names:** use a short typed username (for example `maria`), not a picker of staff names. A list on a public login page tells strangers who works for you and gives an attacker a head start. The phone remembers the last username (never the PIN) in the browser so staff only type the PIN day to day.
- **Errors:** one message for every failure: "Wrong username or PIN, or the account is locked. Ask the owner." That avoids revealing which usernames exist.
- The owner's login is never affected by staff lockouts.

### 8.4 PIN security rules
- **6 digits only.** No 4-digit PINs: 10,000 combinations is too few.
- **Blocked PINs:** one repeated digit (000000), straight runs up or down (123456, 654321, 012345), and repeated short blocks (121212, 123123). The app can generate a random PIN for the owner to read out once; the owner may type their own if it passes the rules. The rules are enforced in the database function, not only in the form.
- **Lockout:** 5 wrong tries in a row locks that username for 15 minutes. A second lockout within 24 hours locks it until the owner unlocks it. A correct PIN resets the count.
- **What that buys:** with only the 15-minute lockout an attacker gets about 480 tries a day, roughly 3 years to cover half of the combinations. With the owner-unlock rule they get about 10 tries a day and you see it in the log. A person could also lock a staff member out on purpose by typing wrong PINs; the staff member calls you, you unlock, and the log shows it. Accepted, because it costs you a phone call and not money.
- **Storage:** only a bcrypt hash in `staff_pins`, which no app user can read at all (even you; only the functions touch it). The PIN is never saved in plain text, logged, or put in a link. Next.js prints server action arguments in the development console, so the PIN travels in form data (shown as an empty object) and not as a plain argument.
- **Honest limit:** any 6-digit secret can be recovered quickly from its hash if the table itself ever leaked. The table is readable only by database administrators and the functions.
- **Owner sets and resets:** Staff page, pick the person, Generate or Set PIN, it is shown once, you tell the staff member. Staff changing their own PIN is a later step.
- **Deactivation and roles:** the check function also requires `profiles.active` and `role = 'staff'`. A PIN can never start an owner session, and a deactivated person fails.

### 8.5 Idle time and shared phones
- Make the idle limit depend on the role: **staff 5 minutes** (with the same 30-second warning), owner 15. Re-entering a PIN takes a few seconds. This is a small change: the layout already knows the role and can pass it to `IdleGuard`.
- On a shared shop phone, a PIN session ends at idle or when the person taps Sign out. "Switch user" is just sign out.
- Later, only if wanted: allow staff logins only from the shop's internet address or only in opening hours. The Worker can see both. Mentioned only.

### 8.6 What goes in the activity log
`pin_set`, `pin_reset`, `staff_login` (success), `staff_login_failed` (the first failure per lockout window, with the count, only for real usernames), `staff_locked`, `staff_unlocked`, `staff_deactivated`. **Never** the PIN or a guess. Unknown usernames are not logged one by one, which would let someone flood the log. This builds on section 7, so the audit log (migration `0004`) comes first.

### 8.7 Pieces needed
**Migration `0005_staff_pin.sql`** (after `0004`): table `staff_pins` (user id, lowercase username 3 to 20 characters and unique, bcrypt hash, failed count, lockout count, locked until, set at, set by) with row security on and no grants to anyone. Functions, all `SECURITY DEFINER` with `search_path=''`:
- `owner_set_staff_pin(user, username, pin)`: owner only. The target must be an existing active staff profile. It checks the PIN rules, hashes, and resets the counters.
- `owner_unlock_staff(user)`: owner only.
- `staff_pin_verify(username, pin)`: executable **only by the server key** (`service_role`). Atomic with a row lock. It returns ok, user id and locked-until, and compares against a dummy hash for unknown usernames so timing does not give them away.
- `owner_staff_pin_status()`: lists username, locked-until and set-at for the Staff page, never a hash.

**App:** `lib/pin.ts` (rules and a random PIN generator using `crypto.getRandomValues`), `lib/lockout.ts` (the lockout rules as a pure function, used for wording and as the test vectors), `lib/supabase/admin.ts` (server-only), the `staffLogin` server action (form data, strict validation, same error for every failure), the Staff tab and keypad component, the owner `/staff` page (list, set or reset PIN, unlock, deactivate, reactivate), and the per-role idle limit.

**Worker secret (you do this; I never see the key).** Only needed at the build and deploy stage.
1. Supabase dashboard, Project Settings, API Keys. Copy the **secret** key (starts with `sb_secret_`). Do not paste it in chat.
2. For local testing, add `SUPABASE_SECRET_KEY=...` to `.env.local` (git-ignored).
3. For the live site, in the project folder run `npx wrangler secret put SUPABASE_SECRET_KEY`, paste the key and press Enter. Or in the Cloudflare dashboard open Workers and Pages, then `ab-wifi-vouchers`, then Settings, then Variables and Secrets, then Add, and choose type **Secret**.
4. It must never be a `NEXT_PUBLIC_` variable, never in git.

**Rules for that key in code:** `lib/supabase/admin.ts` begins with `import 'server-only'`; it is used only inside `staffLogin` after the check function says the PIN is right, and inside owner-gated actions; it is never sent to the browser. Because `staffLogin` runs before anyone is signed in, that code path stays tiny and is reviewed separately.

### 8.8 Tests
**Pure unit tests first:** PIN rules (about 40 valid and invalid examples), the random generator always passes the rules (1,000 samples), lockout vectors (failures 1 to 5, exact 15-minute boundary, second lockout becomes a hard lock, success resets, expiry), and idle limits per role.

**Local database harness, real roles:**
- `staff_pins` cannot be read or written by `anon` or `authenticated`, not even the owner.
- `staff_pin_verify` is denied to `anon` and `authenticated` and allowed to `service_role`.
- `owner_set_staff_pin` rejects trivial or wrong-length PINs, owner targets, missing users and non-owner callers.
- 20 parallel wrong tries leave exactly one lockout and a failure count of 5, not more.
- A correct PIN while locked still fails; after the time passes it works; success resets the counters.
- A deactivated staff member fails. A PIN login never yields a non-staff user.
- The same lockout vectors run against the SQL function and must match the pure TypeScript rules.
- Audit rows are written and none contains a PIN; no function ever returns a hash.

**One manual spike** (not part of the automatic tests): on a throwaway user in your real Supabase project, prove that generating a one-time link and redeeming it creates a normal session that `getClaims()` accepts, under the Next.js and OpenNext setup we use. This writes a test user to your Auth system, so it needs your approval and gets deleted afterwards. If it fails, fall back to PIN-C.

### 8.9 Recommendation and smallest first version
Recommend **PIN-B**: 6 digits, typed username, 5 tries then 15 minutes, hard lock on the second lockout, staff idle 5 minutes.
- **v1 (about 2 days):** the spike, then `0005` and its tests, the pin and lockout libraries, `staffLogin` and the Staff tab with keypad, the owner Staff page (set or reset PIN, unlock, deactivate, reactivate, locked status), per-role idle limit, and the log events. Staff accounts are still created by hand in the Supabase dashboard (any long random password, since they will never use it) with the profile row from section 2, then you set the PIN in the app.
- **v2:** staff change their own PIN; create staff accounts from the app (reuses the same secret); a human check (Cloudflare Turnstile) after 3 failures; optional shop-network or opening-hours rule; a cap such as 40 vouchers per staff member per hour to limit damage from a stolen login.
- **Needs your approval:** the throwaway-user spike, adding the Worker secret yourself, applying `0003` to `0005`, and deploying.

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
| 10 | PIN spike: one-time-link sign-in on a throwaway user | 0.5 h | **a throwaway user in your Supabase project**, and the Worker secret for local testing |
| 11 | `0005_staff_pin.sql` plus lockout and RLS tests | 3 to 4 h | **apply to the real database** |
| 12 | `lib/pin.ts`, `lib/lockout.ts`, `staffLogin`, Staff tab and keypad | 4 to 5 h | **Worker secret (you)**, **deploy** |
| 13 | Owner `/staff` page (set or reset PIN, unlock, deactivate, reactivate); this replaces task 8 | 4 h | **deploy** |
| 14 | Per-role idle limit (staff 5 min) | 0.5 h | **deploy** |

Suggested order: 1, 2, 3, 4, 5, 6 together as one release (about 1.5 days of agent time), then 7. Then the PIN login as its own release (10, 11, 12, 13, 14; about 2 days). Task 8 is not needed if the PIN release is built, and task 9 only if staff change often.

## 10. Questions for you

1. How many staff, and do they change often? (1 to 5 and stable: stay manual.)
2. Should staff be able to **void their own mistakes**? Today only you can.
3. Is **v1 of the log** (sales, voids, imports, plan and settings changes, staff changes, plus the Logs page) enough to start, with login events later?
4. Do you want the log to start empty from the day it is applied, or backfilled with past sales, voids and imports?
5. PIN login: are 6 digits acceptable for staff (4 digits are not recommended)?
6. Is a 5-minute idle sign-out for staff acceptable (the owner keeps 15)?
7. Are you willing to add the Supabase secret key to Cloudflare yourself (steps in section 8.7)? Without it the PIN design needs to fall back to the weaker PIN-A.
8. Should staff pick the username (typed, never listed on the login page) or should you assign it?
