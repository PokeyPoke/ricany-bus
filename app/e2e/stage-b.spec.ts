import { test, expect, stops, lines, place, BUS, BUS_TRIP } from './fixtures';

const line1 = lines.find((l) => l.number === '1')!;
const a = stops[line1.directions[0].stops[0]];
const b = stops[line1.directions[0].stops[line1.directions[0].stops.length - 1]];
const busiest = [...stops].sort((x, y) => y.lines.length - x.lines.length)[0];

test('a live bus on the map opens the bus sheet when tapped', async ({ page }) => {
  await page.goto('./classic/?e2e');
  await page.waitForFunction(() => (window as any).__rbMap?.getSource('buses'));
  // bring the bus into the part of the map not covered by the bottom sheet
  await page.evaluate((b) => (window as any).__rbMap.jumpTo({ center: [b.lon, b.lat], zoom: 15, padding: { bottom: 450 } }), BUS);
  await page.waitForFunction(() => { const m = (window as any).__rbMap; return !m.isMoving() && m.queryRenderedFeatures({ layers: ['buses'] }).length > 0; });
  const pt = await page.evaluate(() => {
    const m = (window as any).__rbMap;
    const r = m.getCanvas().getBoundingClientRect();
    const f = m.queryRenderedFeatures({ layers: ['buses'] })[0];
    const p = m.project(f.geometry.coordinates);
    const off = typeof f.properties.off === 'string' ? JSON.parse(f.properties.off) : f.properties.off;
    return { x: p.x + r.left + off[0], y: p.y + r.top + off[1] };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page).toHaveURL(new RegExp(`#/bus/${BUS_TRIP}`));
  await expect(page.locator('.sheet-header .badge')).toHaveText('3');
  await expect(page.locator('.list .row').first()).toBeVisible();
});

test('bus sheet by URL shows line 3 and upcoming stops', async ({ page }) => {
  await page.goto(`./classic/#/bus/${BUS_TRIP}`);
  await expect(page.locator('.sheet-header .badge')).toHaveText('3');
  expect(await page.locator('.list .row').count()).toBeGreaterThan(1);
});

test('line view: numbered stop markers on the map and aria-current on tap', async ({ page }) => {
  await page.goto('./classic/?e2e#/line/3');
  await page.waitForFunction(() => (window as any).__rbMap?.getSource('line-stops'));
  await expect.poll(() => page.evaluate(() => (window as any).__rbMap.querySourceFeatures('line-stops').length)).toBeGreaterThan(0);
  await page.locator('ol.stops li button').nth(3).click();
  await expect(page.locator('ol.stops li button').nth(3)).toHaveAttribute('aria-current', 'true');
});

test('stop board "Jet odsud" opens the from-view with the other-place search', async ({ page }) => {
  await page.goto(`./classic/#/stop/${busiest.id}`);
  await page.getByRole('button', { name: 'Jet odsud' }).click();
  await expect(page).toHaveURL(/#\/from\//);
  await expect(page.getByLabel('Jiná adresa nebo místo…')).toBeVisible();
});

test('about page shows the disclaimer and the ricany.cz link', async ({ page }) => {
  await page.goto('./classic/');
  await page.getByRole('button', { name: 'O aplikaci' }).click();
  await expect(page.getByText('Neoficiální aplikace')).toBeVisible();
  await expect(page.locator('a[href*="ricany.cz"]').first()).toBeVisible();
});

test('share falls back to the clipboard and shows a toast', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
  });
  await page.goto(`./classic/#/plan?mode=now&from=${place(a)}&to=${place(b)}`);
  await page.locator('.card').first().click();
  await page.getByRole('button', { name: 'Sdílet' }).click();
  await expect(page.getByText('Odkaz zkopírován')).toBeVisible();
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the app works offline after first visit', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 }).catch(() => {});
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    // hash-only navigation stays in the same document, so reload to force the service worker to serve the app shell offline
    await page.goto(`./#/plan?mode=now&from=${place(a)}&to=${place(b)}`);
    await page.reload();
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 15_000 });
  });
});

test('service alerts show on the home screen and the affected line, with details on tap', async ({ page }) => {
  await page.goto('./classic/');
  const alert = page.getByRole('button', { name: /Testovací výluka/ });
  await expect(alert).toBeVisible();
  await page.goto('./classic/#/line/1');
  await expect(page.getByRole('button', { name: /Testovací výluka/ })).toHaveCount(0);
  await page.goto('./classic/#/line/3');
  await page.getByRole('button', { name: /Testovací výluka/ }).click();
  await expect(page.getByText('Linka 3 jede odklonem.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Podrobnosti na pid.cz' })).toHaveAttribute('href', 'https://pid.cz/test');
});
