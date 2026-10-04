import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEnvPath = path.resolve(here, '..', '..', 'server', '.env');

/**
 * Reads the server's `.env` so the tests sign in with the real seeded
 * credentials instead of hard-coding passwords into the repository. Values are
 * overridable from the shell (e.g. CI secrets) and fall back to the documented
 * `seed:demo` development passwords.
 */
const readEnvFile = (file) => {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const env = { ...readEnvFile(serverEnvPath), ...process.env };
const pick = (...keys) => keys.map((key) => env[key]).find((value) => value != null && value !== '');

export const ACCOUNTS = {
  admin: {
    email: pick('SEED_ADMIN_EMAIL', 'ADMIN_EMAIL') || 'admin@hilms.com',
    password: pick('SEED_ADMIN_PASSWORD', 'ADMIN_PASSWORD') || 'Admin@123',
    home: '/admin/dashboard',
  },
  doctor: {
    email: pick('SEED_DOCTOR_EMAIL') || 'dr.anita.gurung@hilms.com',
    password: pick('SEED_DOCTOR_PASSWORD') || 'Doctor@123',
    home: '/doctor/dashboard',
  },
  lab: {
    email: pick('SEED_LAB_EMAIL') || 'lab.technologist@hilms.com',
    password: pick('SEED_LAB_PASSWORD') || 'Lab@12345',
    home: '/lab/dashboard',
  },
  patient: {
    email: pick('SEED_PATIENT_EMAIL') || 'bikash.thapa@hilms.com',
    password: pick('SEED_PATIENT_PASSWORD') || 'Patient@123',
    home: '/patient/dashboard',
  },
  patient2: {
    email: pick('SEED_PATIENT2_EMAIL') || 'sunita.rai@hilms.com',
    password: pick('SEED_PATIENT2_PASSWORD') || 'Patient@123',
    home: '/patient/dashboard',
  },
};

/** Signs in through the real login form and waits for the role dashboard. */
export async function login(page, account, { remember = false } = {}) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  if (remember) {
    await page.getByText('Remember me on this device').click();
  }
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(`**${account.home}`, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Logout', exact: true })).toBeVisible();
}

/** Clicks the sidebar Logout and waits to land back on the sign-in page. */
export async function logout(page) {
  await page.getByRole('link', { name: 'Logout', exact: true }).click();
  await page.waitForURL('**/login', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
}
