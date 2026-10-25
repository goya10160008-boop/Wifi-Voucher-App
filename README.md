# A&B WiFi Voucher Manager

Phone-first web app for selling WiFi vouchers for cash. Import the codes from TP-Link Omada (PDF or pasted text), tap Sell, hand the guest the next unused code. Every sale is recorded.

## First-time setup (about 10 minutes)

1. **Supabase project** (already created, URL in `.env.local`). The database schema is applied. In Supabase, open **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
2. **Create your owner login:** Supabase → **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, tick "Auto Confirm User".
3. **Make that user the owner:** Supabase → **SQL Editor**, run this with your email:
   ```sql
   insert into public.profiles (user_id, role, display_name)
   select id, 'owner', 'Owner' from auth.users where email = 'you@example.com';
   ```
4. **Run it:** `npm install`, then `npm run dev`, open http://localhost:3000, sign in.
5. **Add plans** (Plans page), then **Import** your Omada PDF, pick the plan, Import. Then **Sell**.

Staff accounts: create the user the same way, but insert `'staff'` as the role. Staff can sell and see their own sales, but cannot see unsold codes, plans, import or void.

## Using it on your phone

Open the site in Chrome (Android) or Safari (iPhone), then "Add to Home Screen". It opens like an app. Selling needs internet.

## Everyday use

- **Home:** today's and this month's sales, a Sell button per plan with codes left, and a warning when stock is low.
- **Sell:** use − and + on each plan for how many vouchers (up to 10 in one sale, mixed plans allowed), tap the cash received, see the change, Confirm. One voucher shows its code large with Copy and a QR. Several show every code with its own Copy, a Copy all button and the cash/change summary.
- **Receipt:** on a sale page (after a sale, or from Sales), tap **Show receipt**. You get one clean receipt with every code, the total, cash and change. Take a normal phone screenshot of it. **Copy receipt as text** and **Done** are below it, out of the screenshot. A voided code shows VOIDED with no digits.
- **Sales:** history by date and plan. Tap a sale to see its code again. The owner can void a sale (the code is burned and never resold).
- **Import:** choose the Omada PDF. If the PDF is a picture of the codes, the app reads it with OCR (takes a few seconds). Always check the count in the preview before importing.
- **Idle sign-out:** after 15 minutes without any tap or key press you get a 30-second "Still there?" warning, then you are signed out. Tap **Stay signed in** to continue. Sales are saved the moment you confirm them, so nothing is lost.
- **Download CSV backup** (Sales page) from time to time. The free Supabase plan pauses a project after about a week of no use.

## Commands

| What | Command |
|------|---------|
| Dev server | `npm run dev` |
| Unit tests | `npm test` |
| E2E tests | `npx playwright test` (full flow needs `E2E_EMAIL` and `E2E_PASSWORD` for an owner account) |
| Build | `npm run build` |
| Concurrency test (needs local Supabase) | `SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test` |
| Regenerate app icons | `node scripts/make-icons.mjs` |
| Local Cloudflare preview | `npm run preview` |
| Deploy | `npm run deploy` (ask the owner first) |

## Environment variables

`.env.local` (never committed; see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

There is no secret key in use. Do not add one to a `NEXT_PUBLIC_` variable.

## Deploying to Cloudflare (when you are ready)

1. Create a free Cloudflare account and run `npx wrangler login`.
2. In the Cloudflare dashboard, after the first deploy, open the Worker → **Settings → Variables and secrets** and confirm the two `NEXT_PUBLIC_` values (they are baked in at build time from `.env.local`, so build on the machine that has the file).
3. `npm run deploy`.
4. In Supabase → Authentication → URL Configuration, set the Site URL to your Worker address.

More: `docs/decisions.md`, design spec in `docs/superpowers/specs/`.
