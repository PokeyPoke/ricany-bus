import { test, expect, stops, lines, place, BUS } from './fixtures';

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
  // Free section (the first list, right after the "Zdarma" heading) holds only free cards with free-line badges.
  const freeCards = page.locator('ul.list').first().locator('.card');
  const n = await freeCards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(freeCards.nth(i).locator('.tag-free')).toBeVisible();
  const badges = await freeCards.locator('.badge').allInnerTexts();
  expect(badges.length).toBeGreaterThan(0);
  for (const t of badges) expect(['1', '2', '3', '7', '9', '91', '92']).toContain(t.trim());
  await card.click();
  await expect(page.getByRole('button', { name: 'Zpět' })).toBeVisible();
  await expect(page.locator('.leg.bus').first()).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/Vyrazte/);
});

test.describe('with location', () => {
  test.use({ geolocation: { latitude: a.lat, longitude: a.lon }, permissions: ['geolocation'] });
  test('≤ 3 taps: search a stop from my location', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Kam jedete/ }).first().click(); // tap 1
    await page.getByLabel('Kam', { exact: true }).fill(b.name.slice(0, 6));  // typing
    await page.getByRole('option', { name: new RegExp(b.name.slice(0, 6)) }).first().click(); // tap 2
    await expect(page).toHaveURL(/from=.*to=/);
    const from = new URL(page.url().replace('#/', '')).searchParams.get('from')!;
    expect(Number(from.split(',')[0])).toBeCloseTo(a.lat, 4);
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 15_000 });
  });  test('home lists departures from the nearest stop', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Odjezdy v okolí' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`🚏 ${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeVisible();
    await expect(page.locator('.dep').first()).toBeVisible();
  });
});

test('stop board lists departures and the nearest bike', async ({ page }) => {
  await page.goto(`./#/stop/${busiest.id}`);
  await expect(page.getByRole('heading', { name: new RegExp(busiest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  await expect(page.locator('.dep').first()).toBeVisible();
  const bike = page.locator('button.bike');
  await expect(bike).toContainText('Test stanice');
  await bike.click();
  await expect(page).toHaveURL(/#\/bike\/111/);
  await expect(page.getByText('Kola: 4')).toBeVisible();
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
  await page.getByRole('option', { name: new RegExp(b.name.slice(0, 6)) }).first().click();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /🏠 Domů/ })).toBeVisible();
});

test('explains when no stop is near the start', async ({ page }) => {
  await page.goto(`./#/plan?mode=now&from=49.9,14.65,Daleko&to=${place(b)}`);
  await expect(page.getByText(/Do 1,2 km od výchozího místa/)).toBeVisible({ timeout: 15_000 });
});

test('line 1 weekday timetable opens on a stop with service (regression)', async ({ page }) => {
  await page.goto('./#/line/1');
  await expect(page.locator('.tt-row').first()).toBeVisible();
  await expect(page.getByText('V tento den linka nejede')).toHaveCount(0);
});

test('layers panel: Nextbike off by default, switches toggle and persist', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Vrstvy mapy' }).click();
  const bikes = page.getByRole('switch', { name: 'Stanice Nextbike' });
  await expect(bikes).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: 'Obchody a služby' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Budovy' })).toHaveAttribute('aria-checked', 'true');
  await bikes.click();
  await expect(bikes).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.getByRole('button', { name: 'Vrstvy mapy' }).click();
  await expect(page.getByRole('switch', { name: 'Stanice Nextbike' })).toHaveAttribute('aria-checked', 'true');
});

test('line view -> Kam jedete? -> downstream stop -> direct ride list', async ({ page }) => {
  await page.goto('./#/line/3');
  await page.locator('ol.stops li button').nth(3).click();
  await expect(page.locator('ol.stops button[aria-current="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Kam jedete?' }).last().click();
  await expect(page).toHaveURL(/#\/from\/.*line=3/);
  await page.locator('.ds').first().click();
  await expect(page).toHaveURL(/#\/ride\?/);
  await expect(page.locator('.ride').first()).toBeVisible();
});

test('about page opens from the top bar, in cs and en', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'O aplikaci' }).click();
  await expect(page).toHaveURL(/#\/about/);
  await expect(page.getByText('Neoficiální aplikace')).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText('Unofficial app')).toBeVisible();
});

test('place input is a keyboard-operable combobox', async ({ page }) => {
  await page.goto('./#/plan?mode=now');
  const box = page.getByRole('combobox', { name: 'Kam', exact: true });
  await box.fill(b.name.slice(0, 6));
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await box.press('ArrowDown');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await expect(page).toHaveURL(/to=/);
});
