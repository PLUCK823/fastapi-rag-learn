import { test, expect } from "@playwright/test";

const EMAIL = `e2e_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("full user flow", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // 1. Register
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("邮箱").fill(EMAIL);
  await page.getByPlaceholder("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // 2. Create KB
  await page.getByPlaceholder("知识库名称").fill("E2E 测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("E2E 测试库")).toBeVisible({ timeout: 5000 });

  // 3. Navigate to chat
  await page.getByText("E2E 测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/);

  // 4. Open "新增" modal
  await page.getByRole("button", { name: "+ 新增" }).click();
  await expect(page.getByText("新建文档")).toBeVisible({ timeout: 3000 });

  // 5. Fill filename and Markdown content
  await page.getByPlaceholder("例如: readme.md").fill("hello.md");
  // Click the ByteMD editor and type
  const editor = page.locator(".bytemd-editor .CodeMirror");
  await editor.click();
  await page.keyboard.type("# Hello World\n\nPython 是一门编程语言，广泛用于 Web 开发。");
  await page.getByRole("button", { name: "创建文档" }).click();

  // Modal should close and doc should appear
  await expect(page.getByText("hello.md")).toBeVisible({ timeout: 5000 });

  // 6. Chat
  await page.getByPlaceholder("输入问题，按 Enter 发送...").fill("Python 适合做什么？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("Python 适合做什么？")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Python")).toBeVisible({ timeout: 20000 });

  // 7. Verify nickname
  await expect(page.getByText(EMAIL)).toBeVisible();

  console.log("ALL E2E TESTS PASSED");
});
