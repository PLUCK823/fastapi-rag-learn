import { test, expect } from "@playwright/test";

const EMAIL = `session_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("session behavior tests", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // 1. Register
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // 2. Create KB
  await page.getByPlaceholder("输入知识库名称…").fill("Session 测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("Session 测试库")).toBeVisible({ timeout: 5000 });

  // 3. Navigate to chat
  await page.getByText("Session 测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/);

  // 4. Test 1: New KB should NOT have any session created automatically
  await page.waitForTimeout(1000);

  // Should see "新的对话" in the header (empty state, no session)
  const headerTitle = page.getByRole("heading", { name: "新的对话" });
  await expect(headerTitle).toBeVisible({ timeout: 5000 });

  // Should see "暂无历史会话" (no sessions exist)
  await expect(page.getByText("暂无历史会话")).toBeVisible({ timeout: 5000 });

  // 5. Test 2: Clicking "新建" when no session exists should stay on empty state
  const newSessionButtons = page.getByRole("button", { name: "+ 新建" });
  await newSessionButtons.nth(1).click();
  await page.waitForTimeout(500);

  // Should still show "暂无历史会话" (no sessions created)
  await expect(page.getByText("暂无历史会话")).toBeVisible({ timeout: 5000 });

  // 6. Test 3: Create document and send message to create session
  await page.getByRole("button", { name: "+ 新建" }).first().click();
  await expect(page.getByText("新建文档")).toBeVisible({ timeout: 3000 });
  await page.getByPlaceholder("例如: readme（默认 .md）").fill("test");

  const editorTextarea = page.locator(".bytemd-editor textarea");
  await editorTextarea.waitFor({ state: "visible", timeout: 3000 });
  await editorTextarea.fill("# Test\n\n这是一个测试文档。");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "创建文档" }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator("aside").locator("text=test.md")).toBeVisible({ timeout: 10000 });

  // Send a chat message - this will create the session
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 3000 });
  await chatInput.click();
  await page.keyboard.type("这是什么？", { delay: 50 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  await expect(page.locator(".chat-message").filter({ hasText: "这是什么" })).toBeVisible({ timeout: 10000 });

  // Wait for AI response
  await expect(page.locator("text=回答中")).not.toBeVisible({ timeout: 30000 });

  // Wait for session to be saved
  await page.waitForTimeout(2000);

  // 7. Test 4: Session should now appear in the list - verify "暂无历史会话" is gone
  await expect(page.getByText("暂无历史会话")).not.toBeVisible({ timeout: 5000 });

  // 8. Test 5: Now clicking "新建" should clear and go to empty state
  await newSessionButtons.nth(1).click();
  await page.waitForTimeout(500);

  // Should see empty state again
  await expect(page.getByRole("heading", { name: "新的对话" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder("输入问题，Enter 发送…")).toBeVisible({ timeout: 3000 });

  // Previous session should still be in the list (verify "暂无历史会话" is still gone)
  await expect(page.getByText("暂无历史会话")).not.toBeVisible({ timeout: 5000 });

  console.log("ALL SESSION TESTS PASSED");
});