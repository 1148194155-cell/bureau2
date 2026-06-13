import { chromium } from "playwright";

const WF_ID = process.env.WF_ID || "35";
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "test_screenshots";
const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(BASE_URL);
await page.waitForSelector(".react-flow", { timeout: 15000 });
console.log("Canvas loaded");

// Click the load button
const allBtns = page.locator('button[title]');
const count = await allBtns.count();
console.log("Buttons with title:", count);
for (let i = 0; i < count; i++) {
  const title = await allBtns.nth(i).getAttribute("title");
  console.log("  Title", i, ":", title);
  if (title && (title.includes("Load") || title.includes("load"))) {
    console.log("Clicking button:", title);
    await allBtns.nth(i).click();
    break;
  }
}

// Handle dialog prompt for workflow ID
page.on("dialog", async (dialog) => {
  console.log("Dialog appeared:", dialog.message());
  await dialog.accept(WF_ID);
  console.log("Accepted dialog with " + WF_ID);
});

await page.waitForTimeout(5000);

// ** Programmatic edge creation (headless workaround): **
// After nodes are on canvas, use window.__store to connect them:
//   const edges = await page.evaluate(() => {
//     const s = window.__store.getState();
//     const ids = s.nodes.map(n => n.id);
//     if (ids.length >= 2) {
//       s.onConnect({ source: ids[0], target: ids[1] });
//       return s.edges;
//     }
//     return [];
//   });
//   console.log("Created edges:", edges);

// Take screenshot
const filePath = `${SCREENSHOT_DIR}/canvas_screenshot.png`;
await page.screenshot({ path: filePath, fullPage: false });
console.log("Screenshot saved:", filePath);

await browser.close();
