/**
 * Smoke tests — no auth required. These run against the live deploy by
 * default and catch the catastrophic failures (build broken, key route
 * 500s, API down). They don't replace integration tests; they're the
 * "is the lobby on fire" check.
 */
import { test, expect } from '@playwright/test';

test.describe('public surface', () => {
  test('landing/login page loads and shows a sign-in affordance', async ({ page }) => {
    const res = await page.goto('/');
    // Next.js may redirect / → /login or render landing directly; either is OK.
    expect(res?.status() ?? 0).toBeLessThan(400);
    // Any of these phrases means we got a real page back, not an error wall.
    const body = page.locator('body');
    await expect(body).toContainText(/(Entrar|Login|Cadastrar|FitAI)/i);
  });

  test('login page renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/e-?mail/i).first()).toBeVisible();
    await expect(page.getByLabel(/senha/i).first()).toBeVisible();
  });

  test('register page renders the form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel(/e-?mail/i).first()).toBeVisible();
  });

  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    // Either a hard redirect to /login, or a client-side guard that lands us there.
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });
});

test.describe('api health', () => {
  test('the backend health endpoint responds 200', async ({ request }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL || 'https://fitai-api-production-5fb1.up.railway.app';
    const res = await request.get(`${apiBase}/health`);
    expect(res.status()).toBe(200);
  });
});
