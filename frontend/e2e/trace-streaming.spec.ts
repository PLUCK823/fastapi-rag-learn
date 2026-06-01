import { test, expect } from "@playwright/test";

const EMAIL = `trace_${Date.now()}@test.com`;
const PASSWORD = "test123456";

test("FRAME-BY-FRAME IN-BROWSER timing trace", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  // ── Setup ──
  await page.goto("http://localhost:5173/register");
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByPlaceholder("至少 6 个字符").fill(PASSWORD);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL("/", { timeout: 10000 });
  await page.getByPlaceholder("输入知识库名称…").fill("帧追踪");
  await page.getByRole("button", { name: "创建" }).click();
  await page.getByText("帧追踪").waitFor({ timeout: 5000 });
  // Dismiss onboarding guide if shown (first KB triggers it)
  const traceSkipBtn = page.getByText("跳过引导");
  if (await traceSkipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await traceSkipBtn.click();
    await page.waitForTimeout(500);
  }
  await page.getByText("帧追踪").click();
  await page.waitForURL(/\/chat\/\d+/, { timeout: 5000 });
  await page.locator('input[type="file"]').setInputFiles("/tmp/办公规范.md");
  await page.locator("aside").getByText("办公规范.md").first().waitFor({ timeout: 15000 });
  // Wait for async processing to complete (worker chunking + embedding)
  await page.locator("aside").getByText("处理中…").waitFor({ state: "hidden", timeout: 120000 });

  // ── Inject frame-level tracer in browser ──
  await page.evaluate(() => {
    const samples: { t: number; len: number; txt: string }[] = [];
    let rafId = 0;
    let lastLen = -1;

    const poll = () => {
      const msg = document.querySelector('.chat-message[data-role="assistant"]');
      if (msg) {
        const txt = msg.textContent || "";
        const len = txt.replace(/▊/g, "").trim().length;
        if (len !== lastLen) {
          lastLen = len;
          samples.push({ t: performance.now(), len, txt: txt.slice(0, 80) });
        }
      }
      rafId = requestAnimationFrame(poll);
    };

    // Start polling at 60fps
    rafId = requestAnimationFrame(poll);

    // Store sampler on window for later retrieval
    (window as any).__samples = samples;
    (window as any).__stopPoll = () => cancelAnimationFrame(rafId);
  });

  // ── Send question ──
  const chatInput = page.getByPlaceholder("输入问题，Enter 发送…");
  await chatInput.click();
  await page.keyboard.type("员工每月考勤补卡最多允许几次？", { delay: 20 });
  await page.keyboard.press("Enter");

  // Wait for streaming to complete
  await page.locator("text=回答中").waitFor({ state: "visible", timeout: 5000 });
  await page.locator("text=回答中").waitFor({ state: "hidden", timeout: 60000 });
  await page.waitForTimeout(500);

  // Stop the poller and get samples
  await page.evaluate(() => (window as any).__stopPoll());

  const samples: { t: number; len: number; txt: string }[] =
    await page.evaluate(() => (window as any).__samples);

  // ── Print results ──
  console.log(`\n=== FRAME-LEVEL DOM SAMPLES (${samples.length} unique states) ===`);
  if (samples.length === 0) {
    console.log("NO SAMPLES COLLECTED!");
  } else {
    const startT = samples[0].t;
    // Show first and last few, plus any jumps > 5 chars
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const dt = (s.t - startT).toFixed(0);
      const dLen = i > 0 ? s.len - samples[i - 1].len : s.len;
      if (i < 5 || i >= samples.length - 5 || dLen > 5) {
        console.log(`  [+${dt}ms] len=${s.len} (+${dLen}) "${s.txt}"`);
      }
    }
    console.log(`  Total states: ${samples.length}, final len: ${samples[samples.length - 1]?.len}`);
  }

  // Verify answer
  const finalText = await page.locator(".chat-message[data-role='assistant']").last().textContent();
  expect(finalText).toMatch(/3\s*次/);
});
