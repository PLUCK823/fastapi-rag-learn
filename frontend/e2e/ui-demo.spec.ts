import { test, expect } from "@playwright/test";

const EMAIL = `demo_${Date.now()}@test.com`;
const PASSWORD = "demo123456";
const SCREENSHOT_DIR = "test-results/ui-demo";

test("完整链路演示 — 注册→上传文档→提问→验证", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // ═══════════════════════════════════════
  // Step 1: 注册页面
  // ═══════════════════════════════════════
  await page.goto("http://localhost:5173/register");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-register-page.png`, fullPage: true });

  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-register-filled.png`, fullPage: true });

  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-kblist.png`, fullPage: true });

  // ═══════════════════════════════════════
  // Step 2: 创建知识库 + 上传文档
  // ═══════════════════════════════════════
  await page.getByPlaceholder("输入知识库名称…").fill("办公系统规范库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("办公系统规范库")).toBeVisible({ timeout: 5000 });
  // Dismiss onboarding guide if shown (first KB triggers it)
  const demoSkipBtn = page.getByText("跳过引导");
  if (await demoSkipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await demoSkipBtn.click();
    await page.waitForTimeout(500);
  }
  await page.getByText("办公系统规范库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/, { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-chat-empty.png`, fullPage: true });

  // Upload document
  await page.locator('input[type="file"]').setInputFiles("/tmp/办公规范.md");
  await expect(page.locator("aside").getByText("办公规范.md")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-doc-uploaded.png`, fullPage: true });

  // ═══════════════════════════════════════
  // Step 3: 提问
  // ═══════════════════════════════════════
  const question = "员工每月考勤补卡最多允许几次？单笔金额多少元以上的采购需要总经理终审？";
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 5000 });
  await chatInput.click();
  await page.keyboard.type(question, { delay: 20 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-question-typed.png`, fullPage: true });

  await page.keyboard.press("Enter");

  // ═══════════════════════════════════════
  // Step 4: 等待流式回答完成
  // ═══════════════════════════════════════
  await expect(page.locator("text=回答中")).not.toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000); // 等代码执行结果回来
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-answer-complete.png`, fullPage: true });

  // ═══════════════════════════════════════
  // Step 5: 点击引用气泡，查看文档高亮
  // ═══════════════════════════════════════
  const citeButton = page.locator("button:has-text('办公规范')").first();
  if (await citeButton.isVisible()) {
    await citeButton.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-doc-viewer.png`, fullPage: true });
  }

  // ═══════════════════════════════════════
  // Step 6: 验证结果
  // ═══════════════════════════════════════
  const allText = await page.locator(".chat-message").allTextContents();
  const fullText = allText.join("\n");
  const hasThree = /3\s*次/.test(fullText);
  const has5000 = /5000\s*元/.test(fullText);

  console.log("══════════════════════════════");
  console.log(`补卡次数 (3 次): ${hasThree ? "✅" : "❌"}`);
  console.log(`采购金额 (5000 元): ${has5000 ? "✅" : "❌"}`);
  console.log("══════════════════════════════");
  console.log("完整回答:");
  console.log(fullText.substring(fullText.indexOf("根据"), fullText.indexOf("根据") + 400));
  console.log("══════════════════════════════");

  expect(hasThree, "答案必须包含 '3 次'").toBe(true);
  expect(has5000, "答案必须包含 '5000 元'").toBe(true);
});
