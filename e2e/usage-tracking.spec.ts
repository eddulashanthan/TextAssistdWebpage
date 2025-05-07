import { test, expect } from '@playwright/test';

test.describe('Usage Tracking Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Always start with a clean session to avoid state leakage between tests
    await context.clearCookies();
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'licensed@example.com');
    await page.fill('[data-testid="password-input"]', 'Test1234');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should display current usage minutes remaining', async ({ page }) => {
    const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
    await expect(minutesElem).toBeVisible();
    const text = await minutesElem.textContent();
    if (!text || !/\d/.test(text)) {
      throw new Error('Test data error: No minutes remaining displayed. Ensure test user has a valid license and usage.');
    }
    expect(text).toMatch(/Minutes Remaining:/);
  });

  test('should track usage and update minutes remaining', async ({ page }) => {
    const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
    await expect(minutesElem).toBeVisible();
    const beforeText = await minutesElem.textContent();
    if (!beforeText || !/\d/.test(beforeText)) {
      throw new Error('Test data error: No minutes remaining displayed. Ensure test user has a valid license and usage.');
    }
    const before = parseFloat((beforeText || '').replace(/[^0-9.]/g, ''));
    if (isNaN(before)) {
      throw new Error(`Could not parse minutes remaining: "${beforeText}"`);
    }

    await page.click('[data-testid="track-usage-button"]');
    await page.fill('[data-testid="usage-minutes-input"]', '15');
    await page.click('[data-testid="confirm-usage-button"]');
    await expect(page.locator('[data-testid="usage-success"]')).toBeVisible();

    // Wait for UI to update
    await page.waitForTimeout(500);
    const afterText = await minutesElem.textContent();
    if (!afterText || !/\d/.test(afterText)) {
      throw new Error('Test data error: No minutes remaining displayed after tracking.');
    }
    const after = parseFloat((afterText || '').replace(/[^0-9.]/g, ''));
    if (isNaN(after)) {
      throw new Error(`Could not parse minutes remaining after tracking: "${afterText}"`);
    }
    expect(after).toBeLessThan(before);
  });

  test('should show error when exceeding remaining minutes', async ({ page }) => {
    const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
    const text = await minutesElem.textContent();
    if (!text || !/\d/.test(text)) {
      throw new Error('Test data error: No minutes remaining displayed. Ensure test user has a valid license and usage.');
    }
    const remaining = parseFloat((text || '').replace(/[^0-9.]/g, ''));
    if (isNaN(remaining)) {
      throw new Error(`Could not parse minutes remaining: "${text}"`);
    }
    await page.click('[data-testid="track-usage-button"]');
    await page.fill('[data-testid="usage-minutes-input"]', (remaining + 100).toString());
    await page.click('[data-testid="confirm-usage-button"]');
    await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="usage-error"]')).toContainText('Insufficient minutes remaining');
  });

  test('should reject negative or zero usage values', async ({ page }) => {
    await page.click('[data-testid="track-usage-button"]');
    await page.fill('[data-testid="usage-minutes-input"]', '-10');
    await page.click('[data-testid="confirm-usage-button"]');
    await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="usage-error"]')).toContainText('Minutes used must be a positive number');
    // Try zero
    await page.fill('[data-testid="usage-minutes-input"]', '0');
    await page.click('[data-testid="confirm-usage-button"]');
    await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="usage-error"]')).toContainText('Minutes used must be a positive number');
  });

  test('should display the usage chart', async ({ page }) => {
    await expect(page.locator('[data-testid="tracking-usage-chart"]')).toBeVisible();
  });

  // Edge case: expired license
  test('should show error and disable tracking for expired license', async ({ page, context }) => {
    // Always clear cookies to ensure login page is shown
    await context.clearCookies();
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'nolicense@example.com');
    await page.fill('[data-testid="password-input"]', 'Test1234');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    // Check status
    const status = await page.locator('[data-testid="license-status"]').textContent();
    expect(status?.trim()).toBe('expired');
    // Try to track usage
    await page.click('[data-testid="track-usage-button"]');
    await page.fill('[data-testid="usage-minutes-input"]', '10');
    await page.click('[data-testid="confirm-usage-button"]');
    await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="usage-error"]')).toContainText('License is expired');
  });

  // Future enhancement: add revoked license handling test
  // test('should show error and disable tracking for revoked license', ...);
});