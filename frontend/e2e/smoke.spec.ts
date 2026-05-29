import { test, expect } from "@playwright/test";

const EMAIL = `e2e_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("full user flow", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // 1. Register
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册并登录" }).click();
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

  // 6. Create a new session before chatting (required for WebSocket)
  // The second "+ 新建" button is for sessions (in the "会话" section)
  const newSessionButtons = page.getByRole("button", { name: "+ 新建" });
  await newSessionButtons.nth(1).click();
  await page.waitForTimeout(500);

  // 7. Chat - fill input and send
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 3000 });

  // Type the question (more reliable than fill for React inputs)
  await chatInput.click();
  await page.keyboard.type("Python 适合做什么？", { delay: 50 });

  // Verify input has the value
  await expect(chatInput).toHaveValue("Python 适合做什么？", { timeout: 3000 });

  // Press Enter to send
  await page.keyboard.press("Enter");

  // Wait for user message to appear in chat
  await page.waitForTimeout(1000);
  await expect(page.locator("text=Python 适合做什么")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Python")).toBeVisible({ timeout: 20000 });

  // 7. Verify user email in header
  await expect(page.getByText(EMAIL)).toBeVisible();

  console.log("ALL E2E TESTS PASSED");
});
