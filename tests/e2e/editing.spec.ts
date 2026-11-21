import { expect, test } from '@playwright/test';

test('Timeline: add, rename, drag to move, undo', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop editing');
  await page.goto('/p/prg_titan/timeline');
  await page.getByRole('button', { name: 'Add task' }).click();
  const name = page.getByRole('textbox', { name: 'Task name' });
  await name.fill('Crane permit renewal');
  await name.press('Enter');
  const row = page.locator('[data-testid^="row-"]').filter({ hasText: 'Crane permit renewal' });
  await expect(row).toBeVisible();
  const id = (await row.getAttribute('data-testid'))!.replace('row-', '');
  const startBefore = await row.locator('span.tabular-nums').nth(1).innerText();

  const bar = page.getByTestId(`bar-${id}`);
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(row.locator('span.tabular-nums').nth(1)).not.toHaveText(startBefore);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row.locator('span.tabular-nums').nth(1)).toHaveText(startBefore);
});
