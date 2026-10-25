import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const needsLogin = () => test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD (an owner account)');

// Unique per run so reruns and the two viewport projects never collide on codes or plan names.
const run = `${Date.now()}`.slice(-7);

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'A&B WiFi' })).toBeVisible();
}

test('protected pages redirect to login', async ({ page }) => {
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/login/);
});

test('login screen renders (screenshot for visual review)', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.screenshot({ path: `test-results/login-${info.project.name}.png` });
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
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
  await expect(page.getByText(/56 of 56 codes selected/)).toBeVisible({ timeout: 100_000 });
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
  await expect(page.getByText('Imported 2. Already had 0. Invalid 0.')).toBeVisible();

  await page.goto('/sell');
  await page.getByRole('radio', { name: new RegExp(plan) }).click();
  await expect(page.getByRole('radio', { name: new RegExp(plan) })).toContainText('2 left');
  await page.getByRole('button', { name: '₱50.00' }).click();
  await expect(page.getByText('Change: ₱30.00')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm sale' }).click();

  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}\?new=1/);
  await expect(page.getByText(codes[0], { exact: true })).toBeVisible(); // FIFO: oldest first
  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.getByText('Copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(codes[0]);

  await page.getByPlaceholder('Reason').fill('e2e test');
  await page.getByRole('button', { name: 'Void sale' }).click();
  await expect(page.getByText(/VOIDED: e2e test/)).toBeVisible();

  await page.goto('/sales');
  await expect(page.getByText(codes[0]).first()).toBeVisible();
  await expect(page.getByText(/Total: ₱0\.00/)).toBeVisible(); // the only sale was voided, so excluded
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
