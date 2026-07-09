import { test, expect } from '@playwright/test';

test('homepage loads and shows session list', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await expect(page).toHaveTitle(/OpenCode/);
  // The page should show the session list or a connect message
  await expect(page.locator('text=Session').first()).toBeVisible({ timeout: 10000 });
});
