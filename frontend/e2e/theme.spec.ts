import { expect, test } from "@playwright/test";

const EMAIL = `theme_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("theme toggle works across pages and persists", async ({ page }) => {
  // 1. Register + Login
  await page.goto("http://127.0.0.1:5173/register");
  await page.fill('input[placeholder="name@example.com"]', EMAIL);
  await page.fill('input[placeholder="至少 6 个字符"]', PASSWORD);
  await page.click('button:has-text("注册")');
  await page.waitForURL("http://127.0.0.1:5173/");

  // 2. Default should be light theme
  const html = page.locator("html");
  const initialTheme = await html.getAttribute("data-theme");
  expect(initialTheme === "light" || initialTheme === null).toBeTruthy();

  // 3. Find and click theme toggle (moon icon = switch to dark)
  const themeToggle = page.locator('button[aria-label*="暗色" i], button[aria-label*="亮色" i], button[title*="暗色" i], button[title*="亮色" i]').first();
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();

  // 4. Theme should switch to dark
  await expect(html).toHaveAttribute("data-theme", "dark");

  // 5. Navigate to a different page — theme should persist
  // Create a KB first so we can navigate
  await page.fill('input[placeholder="输入知识库名称…"]', "主题测试库");
  await page.click('button:has-text("创建")');
  await page.waitForTimeout(500);
  await page.click('a:has-text("主题测试库")');
  await page.waitForURL(/\/chat\/\d+/);

  // Theme should still be dark on the chat page
  await expect(html).toHaveAttribute("data-theme", "dark");

  // 6. Open settings modal — should render in dark theme
  // Click the user menu button (shows email or "用户")
  const userBtn = page.locator("nav button").filter({ hasText: /@|用户/ }).first();
  await userBtn.click();
  await page.waitForTimeout(200);
  const settingsBtn = page.locator('button:has-text("个人设置")');
  await settingsBtn.click();
  await page.waitForTimeout(300);
  // Settings modal should be visible with dark theme backdrop
  await expect(page.locator('h2:has-text("个人设置")')).toBeVisible();
  // Close modal by clicking the close button
  await page.locator('button:has-text("×")').first().click();
  await page.waitForTimeout(200);

  // 7. Switch back to light
  const themeToggle2 = page.locator('button[aria-label*="暗色" i], button[aria-label*="亮色" i], button[title*="暗色" i], button[title*="亮色" i]').first();
  await themeToggle2.click();
  await expect(html).toHaveAttribute("data-theme", "light");

  console.log("✅ Theme toggle test passed");
});
