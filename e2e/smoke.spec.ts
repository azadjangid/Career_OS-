import { expect, test } from '@playwright/test';

const email = `e2e-${Date.now()}@example.com`;
const password = 'E2eStrongPass1';

test('sign up, stay signed in after a reload, add an application, sign out and back in', async ({ page }) => {
  await page.goto('/register');
  await page.getByPlaceholder('Azad Jangid').fill('E2E Tester');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder(/Min 8 chars/).fill(password);
  await page.locator('button[type="submit"]').click();

  // First run lands in the onboarding wizard
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Confirm your email/)).toBeVisible();

  // Only "who is signed in" is stored; the access token is never in localStorage
  const stored = await page.evaluate(() => localStorage.getItem('careeros-auth') ?? '');
  expect(stored).not.toMatch(/accessToken"\s*:\s*"ey/);

  // After a reload the session comes back from the httpOnly refresh cookie
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();

  // Track an application through the API with the page's own session
  const created = await page.evaluate(async () => {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    const token = (await r.json()).data.accessToken as string;
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyName: 'Playwright Labs', title: 'QA Engineer', status: 'APPLIED' }),
    });
    return res.status;
  });
  expect(created).toBe(201);
  await page.goto('/applications');
  await expect(page.getByText('Playwright Labs').first()).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
});
