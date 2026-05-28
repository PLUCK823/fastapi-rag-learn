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

  // 4. Add document via ByteMD editor
  const editor = page.locator(".bytemd-editor .CodeMirror");
  await editor.click();
  await page.keyboard.type("Python 是一门编程语言，广泛用于 Web 开发。");
  await page.getByPlaceholder("文件名").fill("hello.txt");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("hello.txt")).toBeVisible({ timeout: 5000 });

  // 5. Chat
  await page.getByPlaceholder("输入问题，按 Enter 发送...").fill("Python 适合做什么？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("Python 适合做什么？")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Python")).toBeVisible({ timeout: 20000 });

  // 6. Verify nickname
  await expect(page.getByText(EMAIL)).toBeVisible();

  console.log("ALL E2E TESTS PASSED");
});
