import { test, expect } from '@playwright/test';
import { ACCOUNTS, login, logout } from './helpers.js';

/**
 * Every seeded role can sign in through the real form, lands on its own
 * dashboard, and sees the navigation that exposes the connected workflow.
 */
const CASES = [
  { name: 'admin', account: ACCOUNTS.admin, nav: ['Billing', 'Laboratory', 'Reports'] },
  { name: 'doctor', account: ACCOUNTS.doctor, nav: ['Consultations', 'Lab Reports'] },
  { name: 'lab', account: ACCOUNTS.lab, nav: ['Sample Collection', 'Processing', 'Reports'] },
  { name: 'patient', account: ACCOUNTS.patient, nav: ['Medical History', 'Lab Reports', 'Payments'] },
  { name: 'patient2', account: ACCOUNTS.patient2, nav: ['Appointments', 'Prescriptions'] },
];

for (const testCase of CASES) {
  test(`${testCase.name} signs in and reaches their dashboard`, async ({ page }) => {
    await login(page, testCase.account);
    await expect(page).toHaveURL(new RegExp(`${testCase.account.home.replace(/[/]/g, '\\/')}$`));
    await expect(page.locator('main')).toBeVisible();
    for (const label of testCase.nav) {
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });
}

test('a signed-in user can log out and is bounced from a protected route', async ({ page }) => {
  await login(page, ACCOUNTS.patient);
  await logout(page);

  // The httpOnly cookie is cleared server-side, so a protected route redirects.
  await page.goto('/patient/dashboard');
  await page.waitForURL('**/login', { timeout: 20_000 });
});

test('bad credentials are rejected and stay on the sign-in page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.patient.email);
  await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
