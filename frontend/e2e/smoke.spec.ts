import { test, expect } from "@playwright/test";

const EMAIL = `e2e_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("full user flow", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // 1. Register
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // 2. Create KB
  await page.getByPlaceholder("输入知识库名称…").fill("E2E 测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("E2E 测试库")).toBeVisible({ timeout: 5000 });

  // 3. Navigate to chat
  await page.getByText("E2E 测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/);

  // 4. Open "新建" modal (first + 新建 button is for documents)
  await page.getByRole("button", { name: "+ 新建" }).first().click();
  await expect(page.getByText("新建文档")).toBeVisible({ timeout: 3000 });

  // 5. Fill filename and Markdown content
  await page.getByPlaceholder("例如: readme（默认 .md）").fill("hello");

  // Wait for ByteMD editor to be ready and fill content via the textarea
  const editorTextarea = page.locator(".bytemd-editor textarea");
  await editorTextarea.waitFor({ state: "visible", timeout: 3000 });
  await editorTextarea.fill("# Hello World\n\nPython 是一门编程语言，广泛用于 Web 开发。");

  // Wait a moment for content to sync
  await page.waitForTimeout(500);

  // Click create button
  await page.getByRole("button", { name: "创建文档" }).click();

  // Wait for modal to close and doc to appear
  await page.waitForTimeout(2000);

  // Modal should close and doc should appear - check by text content
  await expect(page.locator("text=hello.md")).toBeVisible({ timeout: 10000 });

  // 6. Chat - fill input and send
  // Note: No session exists yet, will be created when message is sent
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 3000 });

  // Verify no sessions exist yet
  await expect(page.getByText("暂无历史会话")).toBeVisible({ timeout: 3000 });

  // Type the question
  await chatInput.click();
  await page.keyboard.type("Python 适合做什么？", { delay: 50 });

  // Verify input has the value
  await expect(chatInput).toHaveValue("Python 适合做什么？", { timeout: 3000 });

  // Press Enter to send
  await page.keyboard.press("Enter");

  // Wait for user message to appear
  const userMessage = page.locator(".chat-message").filter({ hasText: "Python" });
  await expect(userMessage).toBeVisible({ timeout: 15000 });

  // Wait for AI response to complete (streaming indicator should disappear)
  await expect(page.locator("text=回答中")).not.toBeVisible({ timeout: 30000 });

  // Verify AI response contains expected content
  const aiMessage = page.locator(".chat-message").filter({ hasText: "Web" });
  await expect(aiMessage).toBeVisible({ timeout: 5000 });

  // Wait for session to be saved
  await page.waitForTimeout(3000);

  // Debug: Check what sessions are in the list
  const sessionListContent = await page.locator("aside").locator("div").filter({ hasText: "会话" }).first().innerHTML();
  console.log("Session list HTML:", sessionListContent.substring(0, 500));

  // Now session should appear in the list - check for any session with messages
  // The session name is the first question, but it might be truncated
  // Just verify that "暂无历史会话" is no longer visible
  await expect(page.getByText("暂无历史会话")).not.toBeVisible({ timeout: 5000 });

  // 7. Verify user email in header
  await expect(page.getByText(EMAIL)).toBeVisible();

  console.log("ALL E2E TESTS PASSED");
});
