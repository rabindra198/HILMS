import { test, expect } from '@playwright/test';
import { ACCOUNTS, login } from './helpers.js';

/**
 * FR-AUTH-09 / FR-AUTH-11 in a real browser: the current sign-in is listed and
 * "sign out of all devices" revokes the session that is holding the page open.
 */
test('the sessions panel lists this device and can revoke every session', async ({ page }) => {
  await login(page, ACCOUNTS.patient);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/patient/settings');

  await expect(page.getByRole('heading', { name: 'Sessions & devices' })).toBeVisible();
  await expect(page.getByText('This device')).toBeVisible();
  await expect(page.getByText('Recent sign-ins to your account.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out of all devices' }).click();

  // Revoking every session clears the local session too, so the guard returns
  // the browser to the sign-in page.
  await page.waitForURL('**/login', { timeout: 20_000 });

  // And the old cookie is genuinely dead: a protected route bounces again.
  await page.goto('/patient/dashboard');
  await page.waitForURL('**/login', { timeout: 20_000 });
});

test('a remembered device is labelled in the session list', async ({ page }) => {
  await login(page, ACCOUNTS.patient2, { remember: true });

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/patient/settings');

  await expect(page.getByText('Remembered')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out of all devices' }).click();
  await page.waitForURL('**/login', { timeout: 20_000 });
});
