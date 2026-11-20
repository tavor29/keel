import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/p\/prg_titan\/briefing$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Briefing' })).toBeVisible();
});

test('loads the shell on the Titan-1 briefing', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Briefing' })).toBeVisible();
  await expect(page.getByText(/Good morning, Alex/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Stage gates' })).toBeVisible();
});

test('command palette navigates to the timeline', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('timeline');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Timeline' })).toBeVisible();
});

test('dark theme applies and persists across reloads', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('dark');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('persona switch to the supplier guest hides Lumen AI', async ({ page, isMobile }) => {
  test.skip(isMobile, 'persona menu is covered on desktop');
  await page.getByRole('button', { name: 'Switch persona' }).click();
  await page.getByRole('menuitem', { name: /Chris Wu/ }).click();
  await page.getByRole('button', { name: 'Switch program' }).click();
  await expect(page.getByRole('menuitem', { name: 'Titan-1' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Lumen AI' })).toHaveCount(0);
});

test('mobile: navigation opens as a drawer', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'drawer only exists below md');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Status report' }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
