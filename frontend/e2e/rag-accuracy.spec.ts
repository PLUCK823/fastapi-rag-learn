import { test, expect } from "@playwright/test";

const EMAIL = `ragtest_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("RAG numerical accuracy - full chain test", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // ── 1. Register ──
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // ── 2. Create KB ──
  await page.getByPlaceholder("输入知识库名称…").fill("RAG精度测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("RAG精度测试库")).toBeVisible({ timeout: 5000 });
  // Dismiss onboarding guide if shown (first KB triggers it)
  const ragSkipBtn = page.getByText("跳过引导");
  if (await ragSkipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await ragSkipBtn.click();
    await page.waitForTimeout(500);
  }
  await page.getByText("RAG精度测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/, { timeout: 5000 });

  // ── 3. Upload the document ──
  await page.locator('input[type="file"]').setInputFiles("/tmp/办公规范.md");

  // Wait for document to appear in sidebar
  await page.locator("aside").getByText("办公规范.md").first().waitFor({ timeout: 15000 });

  // ── 4. Ask the question ──
  const question = "员工每月考勤补卡最多允许几次？单笔金额多少元以上的采购需要总经理终审？";
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 5000 });
  await chatInput.click();
  await page.keyboard.type(question, { delay: 30 });
  await page.keyboard.press("Enter");

  // ── 5. Wait for streaming to complete ──
  try {
    await expect(page.locator("text=回答中")).toBeVisible({ timeout: 5000 });
  } catch { /* may appear too briefly */ }
  await expect(page.locator("text=回答中")).not.toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // ── 6. Get ALL text content on the page (chat bubble area) ──
  const allText = await page.locator(".chat-message").allTextContents();
  console.log("=== ALL CHAT MESSAGES ===");
  for (const t of allText) {
    console.log(`[MSG]: ${t.substring(0, 300)}`);
  }
  console.log("=== END ===");

  const fullText = allText.join("\n");

  // ── 7. Verify critical values ──
  const hasThree = /3\s*次/.test(fullText);
  const has5000 = /5000\s*元/.test(fullText);

  console.log(`Found "3 次": ${hasThree}`);
  console.log(`Found "5000 元": ${has5000}`);

  // Screenshot for visual check
  await page.screenshot({ path: "test-results/rag-accuracy-result.png", fullPage: true });

  expect(hasThree, "Answer must contain '3 次'").toBe(true);
  expect(has5000, "Answer must contain '5000 元'").toBe(true);

  console.log("✅ RAG ACCURACY TEST PASSED");
});
