import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';

const POS = JSON.parse(readFileSync(new URL('../src/v3/schemaStops.json', import.meta.url), 'utf8')) as Record<string, [number, number]>;

// the beta on the city's line diagram (/v3/): the diagram is the map, taps on its stops fill the sentence
test('v3: the line diagram is the map and its stops can be tapped', async ({ page }) => {
  await page.goto('./v3/');
  const paper = page.locator('.schema .paper');
  await expect(paper.locator('img')).toBeVisible();
  await expect(page.locator('header.sentence')).toContainText('Moje poloha');

  // tap a stop's dot on the diagram (diagram point -> screen point through the current transform)
  const [id, [x, y]] = Object.entries(POS)[0];
  const tf = await paper.evaluate((e) => getComputedStyle(e).transform); // matrix(s, 0, 0, s, tx, ty)
  const [s, , , , tx, ty] = tf.slice(7, -1).split(',').map(Number);
  const box = (await page.locator('.schema').boundingBox())!;
  await page.mouse.click(box.x + tx + x * s, box.y + ty + y * s);
  await expect(page).toHaveURL(new RegExp(`#/stop/${id}`));
  await expect(page.locator('.dep').first()).toBeVisible();
});

test('v3: About links to the other versions', async ({ page }) => {
  await page.goto('./v3/#/about');
  await expect(page.getByRole('link', { name: 'Zpět na klasickou verzi' })).toBeVisible();
  await expect(page.getByRole('link', { name: /novou verzi/ })).toBeVisible();
});
