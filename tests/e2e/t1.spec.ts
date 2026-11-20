import { expect, test } from '@playwright/test';

// The hero scenario (docs/demo-scenarios.md, T1), played the way a visitor would.
test('T1 · the switchgear slip plays end to end', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop flow');
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText(/Good morning, Alex/)).toBeVisible();

  // Start the scenario from the demo panel
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByTestId('scenario-t1-switchgear-slip').getByRole('button', { name: 'Run', exact: true }).click();
  const hint = page.getByTestId('demo-hint');
  await expect(hint).toContainText('File & share', { timeout: 15_000 });

  // 1–2. Mail triage: the supplier email has a confident suggestion
  await page.getByRole('navigation', { name: 'Program' }).getByRole('link', { name: 'Mail triage' }).click();
  await expect(page.getByRole('heading', { name: /PO-4471 lineup B: FAT result/ })).toBeVisible();
  await expect(page.getByText(/Keel suggests filing this on/)).toContainText('MV switchgear lineup B');
  await page.getByRole('button', { name: 'File & share' }).click();

  // 3–4. Proposal with computed impact → approve in the Briefing
  await expect(hint).toContainText('Approve', { timeout: 15_000 });
  await page.getByRole('navigation', { name: 'Program' }).getByRole('link', { name: 'Briefing' }).click();
  const proposal = page.getByTestId('proposal-card').filter({ hasText: 'MV switchgear lineup B delivery +21 days' });
  await expect(proposal.getByTestId('impact')).toContainText('G2 · Energization');
  await proposal.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Milestones & gates' })).toContainText('late');

  // 5–6. Check-in answer → CR-015 drafted → switch to the exec
  await expect(hint).toContainText('Jordan Lee', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Jordan', exact: true }).click();
  await page.getByRole('button', { name: 'Approve CR-015' }).click();

  // 7–9. Back to Alex, draft the report
  await expect(hint).toContainText('Status report', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await page.getByRole('navigation', { name: 'Program' }).getByRole('link', { name: 'Status report' }).click();
  await page.getByRole('button', { name: /Draft this week|Refresh draft/ }).first().click();
  const report = page.getByTestId('report');
  await expect(report).toContainText('CR-015');
  await expect(report).toContainText('G2 · Energization');
  await expect(page.getByLabel('Demo controls')).toContainText('email → proposal → approval');

  // The item thread shows the filed email, the proposal and the "Applied" system message
  await page.goto('/p/prg_titan/items/itm_titan_swgr_b');
  await expect(page.getByTestId('item-detail')).toContainText('PO-4471 lineup B: FAT result');
  await expect(page.getByTestId('item-detail')).toContainText('Applied:');
});
