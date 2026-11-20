import { expect, test } from '@playwright/test';

// Scenario L1 (docs/demo-scenarios.md): played the way a visitor would.
test('L1 · the sprint slip plays end to end', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop flow');
  test.setTimeout(120_000);
  await page.goto('/p/prg_titan/briefing');
  await expect(page.getByText(/Good morning, Alex/)).toBeVisible();

  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByTestId('scenario-l1-sprint-slip').getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/prg_lumen\/briefing/);
  const hint = page.getByTestId('demo-hint');
  await expect(hint).toContainText('Promote', { timeout: 20_000 });

  // Promote Sam's Slack message to a decision
  const nav = page.getByRole('navigation', { name: 'Program' });
  await nav.getByRole('link', { name: 'Channels' }).click();
  await page.getByRole('navigation', { name: 'Channels' }).getByRole('button', { name: /lumen-platform/ }).click();
  await expect(page.getByTestId('channel-message').filter({ hasText: 'Sprint 14 closed in Jira' })).toBeVisible();
  await page.getByRole('button', { name: 'Promote message from Sam Okafor' }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Decision' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Create decision' }).click();
  await expect(page.getByText('Created. The new item links back to this message.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Choose option B in the Briefing
  await expect(hint).toContainText('Choose an option', { timeout: 15_000 });
  await nav.getByRole('link', { name: 'Briefing' }).click();
  const optionB = page.getByTestId('proposal-card').filter({ hasText: 'Option B' });
  await expect(optionB.getByTestId('impact')).toContainText('Public launch');
  await optionB.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByLabel('Demo controls')).toContainText('Done:', { timeout: 15_000 });

  // Boards shows the closed sprint and the backlog
  await nav.getByRole('link', { name: 'Boards & tables' }).click();
  await expect(page.getByRole('region', { name: 'Backlog' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Velocity' })).toBeVisible();
});
