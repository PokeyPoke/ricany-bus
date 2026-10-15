import { test, expect, stops, lines, place } from './fixtures';

const line1 = lines.find((l) => l.number === '1')!;
const a = stops[line1.directions[0].stops[0]];
const b = stops[line1.directions[0].stops[line1.directions[0].stops.length - 1]];
const busiest = [...stops].sort((x, y) => y.lines.length - x.lines.length)[0];

test('home shows search, saved places and the 7 free lines', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Kam jedete/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Linky \d+$/ })).toHaveCount(7);
  await expect(page.getByRole('button', { name: /Přidat místo/ })).toBeVisible();
});

test('language switch to English persists across reloads', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Where to\?/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Where to\?/ }).first()).toBeVisible();
});

test('plans a free-only trip and opens its timeline', async ({ page }) => {
  await page.goto(`./#/plan?mode=now&from=${place(a)}&to=${place(b)}`);
  await expect(page.getByRole('heading', { name: /Zdarma/ })).toBeVisible();
  const card = page.locator('.card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.tag-free')).toBeVisible();
  await card.click();
  await expect(page.getByRole('button', { name: 'Zpět' })).toBeVisible();
  await expect(page.locator('.leg.bus').first()).toBeVisible();
});

test.describe('with location', () => {
  test.use({ geolocation: { latitude: a.lat, longitude: a.lon }, permissions: ['geolocation'] });
  test('≤ 3 taps: search a stop from my location', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Kam jedete/ }).first().click(); // tap 1
    await page.getByLabel('Kam', { exact: true }).fill(b.name.slice(0, 6));  // typing
    await page.getByRole('button', { name: new RegExp(b.name.slice(0, 6)) }).first().click(); // tap 2
    await expect(page).toHaveURL(/from=.*to=/);
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 15_000 });
  });
});

test('stop board lists departures and the nearest bike', async ({ page }) => {
  await page.goto(`./#/stop/${busiest.id}`);
  await expect(page.getByRole('heading', { name: new RegExp(busiest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  await expect(page.locator('.dep').first()).toBeVisible();
});

test.describe('live data down', () => {
  test.use({ delaysStatus: 503 });
  test('shows the no-live-data marker', async ({ page }) => {
    await page.goto(`./#/stop/${busiest.id}`);
    await expect(page.getByText('bez živých dat').first()).toBeVisible({ timeout: 10_000 });
  });
});

test('line view shows a per-stop timetable', async ({ page }) => {
  await page.goto('./#/line/3');
  await expect(page.getByRole('button', { name: 'Po–Pá' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tt-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ne', exact: true }).click();
  await expect(page.getByText('V tento den linka nejede')).toBeVisible();
});

test('saved place persists', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Přidat místo/ }).click();
  await page.getByLabel('Název').fill('Domů');
  await page.getByLabel('Adresa, místo nebo zastávka').fill(b.name.slice(0, 6));
  await page.getByRole('button', { name: new RegExp(b.name.slice(0, 6)) }).first().click();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
});

test('explains when no stop is near the start', async ({ page }) => {
  await page.goto(`./#/plan?mode=now&from=49.9,14.65,Daleko&to=${place(b)}`);
  await expect(page.getByText(/Do 1,2 km od výchozího místa/)).toBeVisible({ timeout: 15_000 });
});
