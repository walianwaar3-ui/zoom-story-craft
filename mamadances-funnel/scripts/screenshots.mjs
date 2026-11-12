// Phone screenshots at 390px in French and English, plus the open checkout.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.BASE || "http://localhost:4173";
const out = process.env.OUT || "screenshots";
const browser = await chromium.launch();
for (const lang of ["fr", "en"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/${lang}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.body.classList.contains("is-loading"));
  await page.screenshot({ path: `${out}/${lang}-390-full.png`, fullPage: true });
  await page.screenshot({ path: `${out}/${lang}-390-fold.png` });
  await page.click(".js-buy");
  await page.check('input[name="bump1"]');
  await page.screenshot({ path: `${out}/${lang}-390-checkout.png` });
  await page.close();
}
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(`${base}/fr/`, { waitUntil: "networkidle" });
await desk.waitForFunction(() => !document.body.classList.contains("is-loading"));
await desk.screenshot({ path: `${out}/fr-desktop-full.png`, fullPage: true });
await browser.close();
console.log("saved to", out);
