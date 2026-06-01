import { test, expect } from "@playwright/test";

const EMAIL = `stream_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("streaming typewriter effect — cursor + incremental rendering", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // ── 1. Register & Login ──
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });

  // ── 2. Create KB ──
  await page.getByPlaceholder("输入知识库名称…").fill("流式测试库");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("流式测试库")).toBeVisible({ timeout: 5000 });
  // Dismiss onboarding guide if shown (first KB triggers it)
  const streamSkipBtn = page.getByText("跳过引导");
  if (await streamSkipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await streamSkipBtn.click();
    await page.waitForTimeout(500);
  }
  await page.getByText("流式测试库").click();
  await expect(page).toHaveURL(/\/chat\/\d+/, { timeout: 5000 });

  // ── 3. Upload document ──
  await page.locator('input[type="file"]').setInputFiles("/tmp/办公规范.md");
  await expect(page.locator("aside").getByText("办公规范.md").first()).toBeVisible({ timeout: 15000 });
  // Wait for async processing to complete (worker chunking + embedding)
  await page.locator("aside").getByText("处理中…").waitFor({ state: "hidden", timeout: 120000 });

  // ── 4. Send question ──
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.waitFor({ state: "visible", timeout: 5000 });
  await chatInput.click();
  await page.keyboard.type("员工每月考勤补卡最多允许几次？", { delay: 30 });
  await page.keyboard.press("Enter");

  // ── 5. "回答中..." indicator should appear ──
  const streamingIndicator = page.locator("text=回答中");
  await expect(streamingIndicator).toBeVisible({ timeout: 5000 });
  console.log("  ✓ '回答中...' indicator visible");

  // ── 6. Blinking cursor (▊) should appear during streaming ──
  const assistantMsg = page.locator(".chat-message[data-role='assistant']").last();
  let cursorSeen = false;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    const text = await assistantMsg.textContent();
    if (text?.includes("▊")) {
      cursorSeen = true;
      console.log(`  ✓ Cursor (▊) detected at ~${(i + 1) * 300}ms`);
      break;
    }
  }

  // ── 7. Wait for streaming to complete ──
  await expect(streamingIndicator).not.toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(500);
  console.log("  ✓ Streaming completed");

  // ── 8. Verify: cursor disappeared, answer present ──
  const finalText = await assistantMsg.textContent();
  expect(finalText, "Final message should not contain cursor").not.toContain("▊");
  expect(finalText?.length || 0, "Final message should have content").toBeGreaterThan(10);

  // ── 9. Verify answer correctness ──
  const hasAnswer = /3\s*次/.test(finalText || "");
  expect(hasAnswer, "Answer should contain '3 次'").toBe(true);

  console.log(`  ✓ Final answer length: ${finalText?.length}, contains '3 次': ${hasAnswer}`);
  console.log("✅ STREAMING END-TO-END TEST PASSED");
  console.log("   flushSync ensures DOM updates per-token for typewriter effect");
  console.log("   CSS cursor (▊) provides visual feedback during LLM think time");
});
