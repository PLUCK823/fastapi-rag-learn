import { test, expect } from "@playwright/test";

const EMAIL = `session_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("session behavior tests", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // 1. Register
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // 2. Create KB
  await page.getByPlaceholder("输入知识库名称…").fill("Session 测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("Session 测试库")).toBeVisible({ timeout: 5000 });

  // 3. Navigate to chat
  await page.getByText("Session 测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/);

  // 4. Test 1: New KB should have an empty session created automatically
  // Wait for page to load
  await page.waitForTimeout(1000);

  // Should see "新的对话" in the header (auto-created empty session)
  const headerTitle = page.getByRole("heading", { name: "新的对话" });
  await expect(headerTitle).toBeVisible({ timeout: 5000 });

  // Should see the empty session in the session list
  const sessionButton = page.getByRole("button", { name: /新的对话.*0 条/ });
  await expect(sessionButton).toBeVisible({ timeout: 5000 });

  // 5. Test 2: Clicking "新建" on empty session should NOT create a new one
  // Find the session "新建" button (second one, in the "会话" section)
  const newSessionButtons = page.getByRole("button", { name: "+ 新建" });
  await newSessionButtons.nth(1).click();
  await page.waitForTimeout(500);

  // Should still have only ONE session (the empty one)
  // Check by counting session buttons with "0 条" (empty sessions)
  const emptySessions = page.locator("button").filter({ hasText: "0 条" });
  const count = await emptySessions.count();
  expect(count).toBe(1); // Only one empty session, not two

  // 6. Test 3: Send a message to create content
  // First create a document
  await page.getByRole("button", { name: "+ 新建" }).first().click();
  await expect(page.getByText("新建文档")).toBeVisible({ timeout: 3000 });
  await page.getByPlaceholder("例如: readme（默认 .md）").fill("test");

  const editorTextarea = page.locator(".bytemd-editor textarea");
  await editorTextarea.waitFor({ state: "visible", timeout: 3000 });
  await editorTextarea.fill("# Test\n\n这是一个测试文档。");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "创建文档" }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator("text=test.md")).toBeVisible({ timeout: 10000 });

  // Now send a chat message
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 3000 });
  await chatInput.click();
  await page.keyboard.type("这是什么？", { delay: 50 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  await expect(page.locator("text=这是什么")).toBeVisible({ timeout: 10000 });

  // 7. Test 4: Now clicking "新建" SHOULD create a new session
  await newSessionButtons.nth(1).click();
  await page.waitForTimeout(500);

  // Should now have at least one empty session (the new one)
  const emptySessionsAfter = page.locator("button").filter({ hasText: "0 条" });
  const countAfter = await emptySessionsAfter.count();
  expect(countAfter).toBeGreaterThanOrEqual(1); // At least one empty session now

  console.log("ALL SESSION TESTS PASSED");
});