import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const needsLogin = () => test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD (an owner account)');

// Unique per run so reruns and the two viewport projects never collide on codes or plan names.
const run = `${Date.now()}`.slice(-7);

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use email and password instead' }).click();
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'A&B WiFi' })).toBeVisible();
}

test('protected pages redirect to login', async ({ page }) => {
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/login/);
});

test('the activity log redirects to login when signed out', async ({ page }) => {
  await page.goto('/logs');
  await expect(page).toHaveURL(/\/login/);
});

// Needs migration 0003 applied to the database the app talks to (otherwise the page says the log is not switched on).
test('owner sees the activity log: by-person card and plain sentences', async ({ page }) => {
  needsLogin();
  await login(page);
  await page.goto('/logs');
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today by person' })).toBeVisible();
  await expect(page.getByText(/(sold \d+ vouchers?|imported \d+ codes?|created plan)/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logs' })).toBeVisible(); // in the bottom nav
});

// Optional second account: a staff user (profile role 'staff') must not reach the log.
test('staff get a 404 on the activity log and no Logs link', async ({ page }) => {
  test.skip(!process.env.E2E_STAFF_EMAIL || !process.env.E2E_STAFF_PASSWORD, 'set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use email and password instead' }).click();
  await page.getByPlaceholder('Email').fill(process.env.E2E_STAFF_EMAIL!);
  await page.getByPlaceholder('Password').fill(process.env.E2E_STAFF_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'A&B WiFi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logs' })).toHaveCount(0);
  expect((await page.goto('/logs'))?.status()).toBe(404);
});

test('login screen renders (screenshot for visual review)', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.screenshot({ path: `test-results/login-${info.project.name}.png` });
});

test('a wrong PIN shows the one generic message and clears the dots', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Username').fill('nobody');
  for (const k of '246810') await page.getByRole('button', { name: k, exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong username or PIN')).toBeVisible();
  await expect(page.getByRole('img', { name: '0 digits entered' })).toBeVisible();
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use email and password instead' }).click();
  await page.getByPlaceholder('Email').fill(email ?? 'nobody@example.com');
  await page.getByPlaceholder('Password').fill('nope-nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('p[role=alert]')).toContainText('Wrong email or password');
});

test('PDF with outlined glyphs is read by OCR and shows a preview', async ({ page }) => {
  needsLogin();
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/import');
  if (await page.getByText('Create a plan first').isVisible()) await createPlan(page, `Seed ${run}`);
  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, '../samples/3HRS_10202026.pdf'));
  // The chosen file name shows at once and again in the confirm sentence above the Import button.
  await expect(page.locator('b', { hasText: '3HRS_10202026.pdf' })).toBeVisible();
  await expect(page.getByText(/56 of 56 codes selected/)).toBeVisible({ timeout: 100_000 });
  await expect(page.getByText('Importing 56 codes from 3HRS_10202026.pdf (choose a plan)')).toBeVisible();
});

async function createPlan(page: Page, name: string) {
  await page.goto('/plans');
  await page.getByLabel('Plan name').first().fill(name);
  await page.getByLabel('Hours').first().fill('3');
  await page.getByLabel('Price in pesos').first().fill('20');
  await page.getByRole('button', { name: 'Add plan' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
}

test('create plan, import, sell, copy, void, totals', async ({ page, context }) => {
  needsLogin();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  const plan = `E2E ${run}`;
  await createPlan(page, plan);

  const codes = [`${run}1`, `${run}2`, `${run}3`].map((c) => c.padStart(8, '0'));
  await page.goto('/import');
  await page.getByText('Or paste codes / CSV').click();
  await page.getByLabel('Pasted codes').fill(codes.join('\n') + '\n' + codes[0]);
  await page.getByRole('button', { name: 'Read codes' }).click();
  await expect(page.getByText('3 of 3 codes selected')).toBeVisible();
  await page.getByRole('button', { name: codes[2] }).click(); // untick one
  await page.getByLabel('Plan', { exact: true }).selectOption({ label: plan });
  await page.getByRole('button', { name: 'Import 2 codes' }).click();
  await expect(page.getByText(`Imported 2 from Pasted text into ${plan}. Already had 0. Invalid 0.`)).toBeVisible();

  await page.goto('/sell');
  await expect(page.getByRole('listitem').filter({ hasText: plan })).toContainText('2 left');
  await page.getByRole('button', { name: 'Add one ' + plan }).click();
  await expect(page.getByText('1 voucher · ₱20.00')).toBeVisible();
  await page.getByRole('tab', { name: /My cart/ }).click();
  await page.getByRole('button', { name: 'Go to payment' }).click();
  await page.getByRole('button', { name: '₱50.00' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Change to give back' })).toContainText('₱30.00');
  await page.getByRole('button', { name: 'Confirm sale' }).click();

  // Every sale opens on its receipt, with the "Sale complete" banner and no QR.
  await expect(page).toHaveURL(/\/sales\/group\/[0-9a-f-]{36}\?new=1/);
  await expect(page.getByRole('status').filter({ hasText: 'Sale complete' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Receipt' }).getByText(codes[0], { exact: true })).toBeVisible(); // FIFO: oldest first
  await expect(page.locator('svg[role="img"], canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByText('Code copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(codes[0]);

  // Owner Test on the owner's own fresh sale: the code goes back on sale.
  await page.getByRole('button', { name: 'Void this receipt' }).click();
  await page.getByLabel('Reason', { exact: true }).selectOption('owner_test');
  await expect(page.getByRole('button', { name: /Void and return 1 code to stock/ })).toBeDisabled(); // needs TEST typed
  await page.getByLabel('Type TEST to confirm').fill('TEST');
  await page.getByRole('button', { name: /Void and return 1 code to stock/ }).click();
  await expect(page.getByText(/This whole receipt is voided: Owner Test\. The code was returned to stock\./)).toBeVisible();
  await page.goto('/sell');
  await expect(page.getByRole('listitem').filter({ hasText: plan })).toContainText('2 left'); // back on sale

  await page.goto('/sales');
  await expect(page.getByText(codes[0]).first()).toBeVisible();
  await expect(page.getByText(/Total: ₱0\.00/)).toBeVisible(); // the only sale was voided, so excluded (the totals line is a fold-out summary)
});

test('sell 3 vouchers in one sale: group page, copy all, void one code', async ({ page, context }) => {
  needsLogin();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  const plan = `E2E multi ${run}`;
  await createPlan(page, plan);
  const codes = [`${run}4`, `${run}5`, `${run}6`].map((c) => c.padStart(8, '0'));
  await page.goto('/import');
  await page.getByText('Or paste codes / CSV').click();
  await page.getByLabel('Pasted codes').fill(codes.join('\n'));
  await page.getByRole('button', { name: 'Read codes' }).click();
  await page.getByLabel('Plan', { exact: true }).selectOption({ label: plan });
  await page.getByRole('button', { name: 'Import 3 codes' }).click();
  await expect(page.getByText(`Imported 3 from Pasted text into ${plan}.`)).toBeVisible();

  await page.goto('/sell');
  const add = page.getByRole('button', { name: 'Add one ' + plan });
  for (let i = 0; i < 3; i++) await add.click();
  await expect(add).toBeDisabled(); // only 3 codes in stock
  await expect(page.getByText('3 vouchers · ₱60.00')).toBeVisible();
  await page.getByRole('tab', { name: /My cart/ }).click();
  await page.getByRole('button', { name: 'Go to payment' }).click();
  await page.getByRole('button', { name: '₱100.00' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Change to give back' })).toContainText('₱40.00');
  await page.getByRole('button', { name: 'Confirm sale' }).click();

  await expect(page).toHaveURL(/\/sales\/group\/[0-9a-f-]{36}\?new=1/);
  for (const c of codes) await expect(page.getByText(c, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy all 3 codes' }).click();
  await expect(page.getByText('Copied 3 codes')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(codes.join('\n'));
  await expect(page.getByRole('article', { name: 'Receipt' })).toContainText('Change');
  await page.getByRole('button', { name: 'Copy all 3', exact: true }).click();
  await expect(page.getByText('Copied 3 codes')).toBeVisible();

  // Void just one code (a code that did not work); the other two stay valid.
  await page.getByRole('button', { name: 'Void this receipt' }).click();
  await page.getByText('Void just one code').click();
  await page.getByLabel('Which code').selectOption({ label: codes[1] });
  await page.getByLabel('Reason for this code').selectOption('code_failed');
  await page.getByRole('button', { name: 'Void this code' }).click();
  await expect(page.getByText(/1 of 3 codes voided: Code did not work/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy all 2', exact: true })).toBeVisible(); // only live codes are copied

  // Void the rest of the receipt in one go.
  await page.getByRole('button', { name: 'Void this receipt' }).click();
  await page.getByLabel('Reason', { exact: true }).selectOption('sold_twice');
  await page.getByRole('button', { name: 'Void 2 codes' }).click();
  await expect(page.getByText(/This whole receipt is voided/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void this receipt' })).toHaveCount(0);
});

test('receipt: all codes on one screenshot-ready receipt, nav hidden, copy as text, done', async ({ page, context }) => {
  needsLogin();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  const plan = `E2E receipt ${run}`;
  await createPlan(page, plan);
  const codes = [`${run}7`, `${run}8`, `${run}9`].map((c) => c.padStart(8, '0'));
  await page.goto('/import');
  await page.getByText('Or paste codes / CSV').click();
  await page.getByLabel('Pasted codes').fill(codes.join('\n'));
  await page.getByRole('button', { name: 'Read codes' }).click();
  await page.getByLabel('Plan', { exact: true }).selectOption({ label: plan });
  await page.getByRole('button', { name: 'Import 3 codes' }).click();
  await expect(page.getByText(`Imported 3 from Pasted text into ${plan}.`)).toBeVisible();

  await page.goto('/sell');
  const add = page.getByRole('button', { name: 'Add one ' + plan });
  for (let i = 0; i < 3; i++) await add.click();
  await page.getByRole('tab', { name: /My cart/ }).click();
  await page.getByRole('button', { name: 'Go to payment' }).click();
  await page.getByRole('button', { name: '₱100.00' }).click();
  await page.getByRole('button', { name: 'Confirm sale' }).click();
  await expect(page).toHaveURL(/\/sales\/group\/[0-9a-f-]{36}\?new=1/);

  await page.getByRole('link', { name: 'Clean view for a screenshot' }).click();
  await expect(page).toHaveURL(/receipt=1/);
  const paper = page.getByRole('article', { name: 'Receipt' });
  await expect(paper).toContainText('A&B Boarding House WiFi');
  await expect(paper).toContainText(/Receipt #[0-9A-F]{6}/);
  for (const c of codes) await expect(paper.getByText(c, { exact: true })).toBeVisible();
  await expect(paper).toContainText('Change');
  // Every code sits under its plan's heading.
  const planBlock = paper.getByRole('region', { name: new RegExp(plan) });
  for (const c of codes) await expect(planBlock).toContainText(c);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0); // nothing but the receipt
  // The buttons sit below the paper, outside a normal phone screenshot.
  const fold = await page.evaluate(() => ({ top: document.querySelector('.receipt-actions')!.getBoundingClientRect().top, vh: innerHeight }));
  expect(fold.top).toBeGreaterThanOrEqual(fold.vh);

  await page.getByRole('button', { name: 'Copy receipt as text' }).click();
  await expect(page.getByText('Receipt copied')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  for (const c of codes) expect(text).toContain(c);
  expect(text).toContain(plan);
  expect(text).toContain('Enter your code on the WiFi login page');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/sales\/group\/[0-9a-f-]{36}\?new=1$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('touch targets are at least 48px on the main screens', async ({ page }) => {
  needsLogin();
  await login(page);
  for (const url of ['/', '/sell', '/sales', '/plans']) {
    await page.goto(url);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not(.sr-only)')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 47.5)
        .map(({ el }) => el.outerHTML.slice(0, 80)),
    );
    expect(small, `small targets on ${url}`).toEqual([]);
  }
});

test('home menu grid and sales filter fit the screen without sideways scrolling', async ({ page }) => {
  needsLogin();
  await login(page);
  await expect(page.getByRole('heading', { name: 'Tap a plan to sell' })).toBeVisible();
  for (const url of ['/', '/sales']) {
    await page.goto(url);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `horizontal overflow on ${url}`).toBeLessThanOrEqual(0);
  }
  // The filters are folded; open them. The From and To date fields sit side by side inside the viewport.
  await page.getByText('Filters:').click();
  const from = await page.getByLabel('From').boundingBox();
  const to = await page.getByLabel('To').boundingBox();
  expect(from && to && from.y === to.y && to.x + to.width <= page.viewportSize()!.width).toBe(true);
});

const IDLE_NOTICE = 'You were signed out because you were idle.';

test('login shows the idle notice only for reason=idle', async ({ page }) => {
  await page.goto('/login?reason=idle');
  await expect(page.getByText(IDLE_NOTICE)).toBeVisible();
  for (const junk of ['<script>alert(1)</script>', 'IDLE', 'idle%20', 'x']) {
    await page.goto(`/login?reason=${junk}`);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText(IDLE_NOTICE)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('alert(1)');
  }
});

test('idle: warning at 14:30, Stay resets, then 15 min of nothing signs out', async ({ page }) => {
  needsLogin();
  await page.clock.install();
  await login(page);
  await page.clock.fastForward('14:45');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stay signed in' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Stay signed in' }).click();
  await expect(dialog).toHaveCount(0);
  await page.clock.fastForward('16:00'); // far past the limit: the next tick signs out
  await expect(page).toHaveURL(/\/login\?reason=idle/);
  await expect(page.getByText(IDLE_NOTICE)).toBeVisible();
});
