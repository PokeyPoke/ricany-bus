import { test, expect, stops } from './fixtures';

// the beta (sentence) version at /v2/: every screen is "Z … do … · kdy"
const busiest = [...stops].sort((x, y) => y.lines.length - x.lines.length)[0];

test('v2: the sentence drives board → trip → back, and the time follows', async ({ page }) => {
  await page.goto('./v2/');
  const bar = page.locator('header.sentence');
  await expect(bar).toContainText('Moje poloha');
  await expect(bar.getByRole('button', { name: 'kam?' })).toBeVisible();

  // a stop as the start: its departures
  await page.goto(`./v2/#/stop/${busiest.id}`);
  await expect(bar).toContainText(busiest.name);
  await expect(page.locator('.dep').first()).toBeVisible();

  // fill "kam?": a trip
  await bar.getByRole('button', { name: 'kam?' }).click();
  await page.getByRole('combobox').fill('nádraží');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/#\/plan\?.*to=/);
  await expect(bar).toContainText('nádraží');

  // change "teď" to tomorrow morning: same sentence, new moment
  await bar.getByRole('button', { name: 'teď' }).click();
  await page.getByRole('button', { name: 'zítra 7:30' }).click();
  await expect(page).toHaveURL(/mode=dep.*t=7%3A30|mode=dep.*t=7:30/);
  await expect(bar).toContainText('zítra 7:30');

  // clear the destination: back to the start stop's board, at the chosen moment
  await bar.getByRole('button', { name: 'Zrušit' }).first().click();
  await expect(page).toHaveURL(/#\/stop\/.*d=\d{8}/);
  await expect(page.getByText(/Odjezdy od:/)).toBeVisible();
});

test('v2: about links back to the classic version', async ({ page }) => {
  await page.goto('./v2/#/about');
  await expect(page.getByRole('link', { name: 'Zpět na klasickou verzi' })).toBeVisible();
});
