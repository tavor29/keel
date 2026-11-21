import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/p\/prg_titan\/briefing$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Briefing' })).toBeVisible();
});

test('loads the shell on the Titan-1 briefing', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Briefing' })).toBeVisible();
  await expect(page.getByText(/Good morning, Alex/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Milestones & gates' })).toBeVisible();
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

test('RAID log opens on the risk register table', async ({ page }) => {
  await page.goto('/p/prg_titan/raid');
  const table = page.getByRole('table', { name: 'Risk register' });
  for (const h of ['Risk', 'Description', 'Severity', 'Probability of occurrence', 'Contingency and mitigation actions']) {
    await expect(table.getByRole('columnheader', { name: new RegExp(h, 'i') })).toBeVisible();
  }
  await expect(page.getByTestId('risk-row')).toHaveCount(14);
  await expect(page.getByTestId('risk-row').first()).toContainText('MV switchgear factory acceptance failure');
  await expect(page.getByTestId('risk-row').first()).toContainText('Plan B');
});

test('RAID log has assumptions, issues and decisions, plus a heat map', async ({ page }) => {
  await page.goto('/p/prg_titan/raid');
  await expect(page.getByRole('figure', { name: 'Risk heat map' })).toBeVisible();
  for (const [tab, table] of [['Assumptions', 'Assumptions log'], ['Issues', 'Issues log'], ['Decisions', 'Decisions log']] as const) {
    await page.getByRole('navigation', { name: 'RAID log sections' }).getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole('table', { name: table })).toBeVisible();
    await expect(page.getByTestId('raid-row').first()).toBeVisible();
  }
});

test('Documents: live charter, traced BRD and a validated RACI', async ({ page }) => {
  await page.goto('/p/prg_titan/documents');
  await expect(page.getByTestId('doc-card')).toHaveCount(4);
  await expect(page.getByTestId('doc-viewer')).toContainText('Milestones & stage gates');
  await page.getByTestId('doc-card').filter({ hasText: 'Business Requirements' }).click();
  await expect(page.getByText('22 of 24 requirements traced')).toBeVisible();
  await page.getByTestId('doc-card').filter({ hasText: 'RACI' }).click();
  await expect(page.getByRole('alert')).toContainText('no one is Accountable');
  await expect(page.getByRole('table', { name: 'RACI matrix' })).toBeVisible();
});
