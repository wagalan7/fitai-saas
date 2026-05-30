/**
 * Authenticated-flow tests — gated on TEST_USER_EMAIL / TEST_USER_PASSWORD
 * env vars so the suite stays runnable without secrets. When creds are
 * present, we walk the critical path:
 *   login → dashboard renders → workouts page renders → nutrition page renders
 * This is the regression net for "did the latest deploy break the app
 * for logged-in users". It's not a full feature test — keep it fast.
 */
import { test, expect } from '@playwright/test';

const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe('authenticated critical path', () => {
  test.skip(!EMAIL || !PASSWORD, 'set TEST_USER_EMAIL and TEST_USER_PASSWORD to run');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Labels aren't htmlFor-linked in the auth pages, so we target inputs by type.
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    // The submit button is typically labelled "Entrar".
    await page.getByRole('button', { name: /entrar|login/i }).first().click();
    // Wait until the auth dance settles into the dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('dashboard renders core widgets', async ({ page }) => {
    // Welcome heading or any of the stat cards proves the dashboard data fetched.
    await expect(page.locator('body')).toContainText(/(Olá|Treinos esta semana|Sequência|Bem-vindo)/i);
  });

  test('workouts page loads', async ({ page }) => {
    await page.goto('/workouts');
    await expect(page.locator('body')).toContainText(/(Minha rotina|Plano de Treino|Gerar plano|Sem plano)/i);
  });

  test('nutrition page loads', async ({ page }) => {
    await page.goto('/nutrition');
    await expect(page.locator('body')).toContainText(/(Minha Dieta|Plano alimentar|Gerar plano)/i);
  });

  test('profile page loads and shows push section', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('body')).toContainText(/(Notificações push|Ativar lembretes|Perfil)/i);
  });
});
