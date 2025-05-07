import { test, expect } from '@playwright/test';

test.describe('License Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    // Go to login page and login as a test user
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'licensed@example.com');
    await page.fill('[data-testid="password-input"]', 'Test1234');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should display the license key masked by default', async ({ page }) => {
    const maskedKey = await page.locator('[data-testid="license-key"]').textContent();
    expect(maskedKey).toMatch(/^•+$/);
  });

  test('should toggle license key visibility', async ({ page }) => {
    // Masked by default
    const maskedKey = await page.locator('[data-testid="license-key"]').textContent();
    expect(maskedKey).toMatch(/^•+$/);
    // Toggle
    await page.click('[data-testid="toggle-license-key-visibility"]');
    const revealedKey = await page.locator('[data-testid="license-key"]').textContent();
    expect(revealedKey).not.toMatch(/^•+$/);
    expect(revealedKey?.length).toBeGreaterThan(5);
    // Toggle back
    await page.click('[data-testid="toggle-license-key-visibility"]');
    const maskedAgain = await page.locator('[data-testid="license-key"]').textContent();
    expect(maskedAgain).toMatch(/^•+$/);
  });

  test('should copy the license key to clipboard and show feedback', async ({ page }) => {
    await page.click('[data-testid="toggle-license-key-visibility"]');
    await page.click('[data-testid="copy-license-key"]');
    await expect(page.locator('text=Copied!')).toBeVisible();
  });

  test('should display the license status', async ({ page }) => {
    const status = await page.locator('[data-testid="license-status"]').textContent();
    expect(["active", "expired", "revoked"]).toContain(status?.trim());
  });
});