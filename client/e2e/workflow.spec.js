import { test, expect } from '@playwright/test';
import { ACCOUNTS, login } from './helpers.js';

/**
 * Read-only traversal of the connected care workflow from each role's point of
 * view. This proves every module screen renders against the live API for the
 * seeded demo data (no route errors, no failed requests).
 */
const VISITS = [
  {
    name: 'admin',
    account: ACCOUNTS.admin,
    pages: [
      ['Billing', '/admin/billing'],
      ['Laboratory', '/admin/laboratory'],
      ['Appointments', '/admin/appointments'],
      ['Reports', '/admin/reports'],
    ],
  },
  {
    name: 'doctor',
    account: ACCOUNTS.doctor,
    pages: [
      ['Appointments', '/doctor/appointments'],
      ['Consultations', '/doctor/consultations'],
      ['Prescriptions', '/doctor/prescriptions'],
      ['Lab Reports', '/doctor/laboratory-reports'],
    ],
  },
  {
    name: 'lab',
    account: ACCOUNTS.lab,
    pages: [
      ['Lab Requests', '/lab/requests'],
      ['Sample Collection', '/lab/samples'],
      ['Processing', '/lab/processing'],
      ['Reports', '/lab/reports'],
    ],
  },
  {
    name: 'patient',
    account: ACCOUNTS.patient,
    pages: [
      ['Appointments', '/patient/appointments'],
      ['Medical History', '/patient/medical-history'],
      ['Prescriptions', '/patient/prescriptions'],
      ['Lab Reports', '/patient/laboratory-reports'],
      ['Payments', '/patient/payments'],
    ],
  },
];

for (const role of VISITS) {
  test(`${role.name} can open every module in the care workflow`, async ({ page }) => {
    await login(page, role.account);

    const failures = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/') && response.status() >= 500) {
        failures.push(`${response.status()} ${url}`);
      }
    });

    for (const [label, path] of role.pages) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('Unable to reach the server')).toHaveCount(0);
    }

    expect(failures, `server errors while browsing: ${failures.join('; ')}`).toEqual([]);
  });
}
