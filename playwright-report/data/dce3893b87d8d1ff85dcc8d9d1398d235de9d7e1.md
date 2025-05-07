# Test info

- Name: License Dashboard UI >> should copy the license key to clipboard and show feedback
- Location: /Users/shanthankumarreddyeddula/TextAssistd/text-assistd-webpage/e2e/license-validation.spec.ts:33:7

# Error details

```
Error: Timed out 5000ms waiting for expect(locator).toBeVisible()

Locator: locator('text=Copied!')
Expected: visible
Received: <element(s) not found>
Call log:
  - expect.toBeVisible with timeout 5000ms
  - waiting for locator('text=Copied!')

    at /Users/shanthankumarreddyeddula/TextAssistd/text-assistd-webpage/e2e/license-validation.spec.ts:36:48
```

# Page snapshot

```yaml
- alert: TextAssistd - AI Assistant for macOS
- button "Open Next.js Dev Tools":
  - img
- button "Open issues overlay": 1 Issue
- button "Collapse issues badge":
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
  - text: active Hours Remaining 5.9h License Key test-licensed-key-1
  - button "Hide license key":
    - img
  - button "Copy license key":
    - img
  - text: 41% used 10h total
  - paragraph: Purchased
  - paragraph: 5/7/2025
  - paragraph: Last Used
  - paragraph: Never
  - heading "Usage History" [level=3]
  - img: Apr 7 Apr 10 Apr 13 Apr 16 Apr 19 Apr 22 Apr 25 Apr 28 May 1 May 4 May 7 0m 1m 2m 3m 4m
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
   3 | test.describe('License Dashboard UI', () => {
   4 |   test.beforeEach(async ({ page }) => {
   5 |     // Go to login page and login as a test user
   6 |     await page.goto('/login');
   7 |     await page.fill('[data-testid="email-input"]', 'licensed@example.com');
   8 |     await page.fill('[data-testid="password-input"]', 'Test1234');
   9 |     await page.click('[data-testid="login-button"]');
  10 |     await page.waitForURL('/dashboard');
  11 |   });
  12 |
  13 |   test('should display the license key masked by default', async ({ page }) => {
  14 |     const maskedKey = await page.locator('[data-testid="license-key"]').textContent();
  15 |     expect(maskedKey).toMatch(/^•+$/);
  16 |   });
  17 |
  18 |   test('should toggle license key visibility', async ({ page }) => {
  19 |     // Masked by default
  20 |     const maskedKey = await page.locator('[data-testid="license-key"]').textContent();
  21 |     expect(maskedKey).toMatch(/^•+$/);
  22 |     // Toggle
  23 |     await page.click('[data-testid="toggle-license-key-visibility"]');
  24 |     const revealedKey = await page.locator('[data-testid="license-key"]').textContent();
  25 |     expect(revealedKey).not.toMatch(/^•+$/);
  26 |     expect(revealedKey?.length).toBeGreaterThan(5);
  27 |     // Toggle back
  28 |     await page.click('[data-testid="toggle-license-key-visibility"]');
  29 |     const maskedAgain = await page.locator('[data-testid="license-key"]').textContent();
  30 |     expect(maskedAgain).toMatch(/^•+$/);
  31 |   });
  32 |
  33 |   test('should copy the license key to clipboard and show feedback', async ({ page }) => {
  34 |     await page.click('[data-testid="toggle-license-key-visibility"]');
  35 |     await page.click('[data-testid="copy-license-key"]');
> 36 |     await expect(page.locator('text=Copied!')).toBeVisible();
     |                                                ^ Error: Timed out 5000ms waiting for expect(locator).toBeVisible()
  37 |   });
  38 |
  39 |   test('should display the license status', async ({ page }) => {
  40 |     const status = await page.locator('[data-testid="license-status"]').textContent();
  41 |     expect(["active", "expired", "revoked"]).toContain(status?.trim());
  42 |   });
  43 | });
```