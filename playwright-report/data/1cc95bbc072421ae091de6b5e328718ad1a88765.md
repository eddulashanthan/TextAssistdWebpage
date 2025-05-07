# Test info

- Name: Usage Tracking Flow >> should show error and disable tracking for expired license
- Location: /Users/shanthankumarreddyeddula/TextAssistd/text-assistd-webpage/e2e/usage-tracking.spec.ts:76:7

# Error details

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-testid="email-input"]')

    at /Users/shanthankumarreddyeddula/TextAssistd/text-assistd-webpage/e2e/usage-tracking.spec.ts:78:16
```

# Page snapshot

```yaml
- alert
- button "Open Next.js Dev Tools":
  - img
- navigation:
  - link "TextAssistd":
    - /url: /
  - text: licensed@example.com
  - button "Sign Out"
- main:
  - heading "Dashboard" [level=1]
  - paragraph: Manage your TextAssistd licenses and monitor usage
  - heading "License Usage" [level=3]
  - text: active Hours Remaining 5.9h License Key •••••••••••••••••••
  - button "Show license key":
    - img
  - button "Copy license key":
    - img
  - text: 41% used 10h total
  - paragraph: Purchased
  - paragraph: 5/7/2025
  - paragraph: Last Used
  - paragraph: Never
  - heading "Usage History" [level=3]
  - img: Apr 7Apr 10Apr 13Apr 16Apr 19Apr 22Apr 25Apr 28May 1May 4May 70m1m2m3m4m
  - heading "Track Usage" [level=2]
  - heading "Current Status" [level=2]
  - paragraph: "Minutes Remaining:"
  - button "Track Usage"
  - heading "Usage History" [level=2]
  - img
  - paragraph: No transactions found
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('Usage Tracking Flow', () => {
   4 |   test.beforeEach(async ({ page }) => {
   5 |     // Go to login page and login as a test user
   6 |     await page.goto('/login');
   7 |     await page.fill('[data-testid="email-input"]', 'licensed@example.com');
   8 |     await page.fill('[data-testid="password-input"]', 'Test1234');
   9 |     await page.click('[data-testid="login-button"]');
  10 |     await page.waitForURL('/dashboard');
  11 |   });
  12 |
  13 |   test('should display current usage minutes remaining', async ({ page }) => {
  14 |     const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
  15 |     await expect(minutesElem).toBeVisible();
  16 |     const text = await minutesElem.textContent();
  17 |     expect(text).toMatch(/Minutes Remaining:/);
  18 |   });
  19 |
  20 |   test('should track usage and update minutes remaining', async ({ page }) => {
  21 |     const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
  22 |     await expect(minutesElem).toBeVisible();
  23 |     const beforeText = await minutesElem.textContent();
  24 |     const before = parseFloat((beforeText || '').replace(/[^0-9.]/g, ''));
  25 |     if (isNaN(before)) {
  26 |       throw new Error(`Could not parse minutes remaining: "${beforeText}"`);
  27 |     }
  28 |
  29 |     await page.click('[data-testid="track-usage-button"]');
  30 |     await page.fill('[data-testid="usage-minutes-input"]', '15');
  31 |     await page.click('[data-testid="confirm-usage-button"]');
  32 |     await expect(page.locator('[data-testid="usage-success"]')).toBeVisible();
  33 |
  34 |     // Wait for UI to update
  35 |     await page.waitForTimeout(500);
  36 |     const afterText = await minutesElem.textContent();
  37 |     const after = parseFloat((afterText || '').replace(/[^0-9.]/g, ''));
  38 |     if (isNaN(after)) {
  39 |       throw new Error(`Could not parse minutes remaining after tracking: "${afterText}"`);
  40 |     }
  41 |     expect(after).toBeLessThan(before);
  42 |   });
  43 |
  44 |   test('should show error when exceeding remaining minutes', async ({ page }) => {
  45 |     const minutesElem = page.locator('[data-testid="usage-minutes-remaining"]');
  46 |     const text = await minutesElem.textContent();
  47 |     const remaining = parseFloat((text || '').replace(/[^0-9.]/g, ''));
  48 |     if (isNaN(remaining)) {
  49 |       throw new Error(`Could not parse minutes remaining: "${text}"`);
  50 |     }
  51 |     await page.click('[data-testid="track-usage-button"]');
  52 |     await page.fill('[data-testid="usage-minutes-input"]', (remaining + 100).toString());
  53 |     await page.click('[data-testid="confirm-usage-button"]');
  54 |     await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
  55 |     await expect(page.locator('[data-testid="usage-error"]')).toContainText('Insufficient minutes remaining');
  56 |   });
  57 |
  58 |   test('should reject negative or zero usage values', async ({ page }) => {
  59 |     await page.click('[data-testid="track-usage-button"]');
  60 |     await page.fill('[data-testid="usage-minutes-input"]', '-10');
  61 |     await page.click('[data-testid="confirm-usage-button"]');
  62 |     await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
  63 |     await expect(page.locator('[data-testid="usage-error"]')).toContainText('Minutes used must be a positive number');
  64 |     // Try zero
  65 |     await page.fill('[data-testid="usage-minutes-input"]', '0');
  66 |     await page.click('[data-testid="confirm-usage-button"]');
  67 |     await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
  68 |     await expect(page.locator('[data-testid="usage-error"]')).toContainText('Minutes used must be a positive number');
  69 |   });
  70 |
  71 |   test('should display the usage chart', async ({ page }) => {
  72 |     await expect(page.locator('[data-testid="tracking-usage-chart"]')).toBeVisible();
  73 |   });
  74 |
  75 |   // Edge case: expired license
  76 |   test('should show error and disable tracking for expired license', async ({ page }) => {
  77 |     await page.goto('/login');
> 78 |     await page.fill('[data-testid="email-input"]', 'nolicense@example.com');
     |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
  79 |     await page.fill('[data-testid="password-input"]', 'Test1234');
  80 |     await page.click('[data-testid="login-button"]');
  81 |     await page.waitForURL('/dashboard');
  82 |     // Check status
  83 |     const status = await page.locator('[data-testid="license-status"]').textContent();
  84 |     expect(status?.trim()).toBe('expired');
  85 |     // Try to track usage
  86 |     await page.click('[data-testid="track-usage-button"]');
  87 |     await page.fill('[data-testid="usage-minutes-input"]', '10');
  88 |     await page.click('[data-testid="confirm-usage-button"]');
  89 |     await expect(page.locator('[data-testid="usage-error"]')).toBeVisible();
  90 |     await expect(page.locator('[data-testid="usage-error"]')).toContainText('License is expired');
  91 |   });
  92 |
  93 |   // Future enhancement: add revoked license handling test
  94 |   // test('should show error and disable tracking for revoked license', ...);
  95 | });
```