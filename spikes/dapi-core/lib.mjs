import { chromium } from "playwright";
import fs from "fs";
export const URL_PAGE = process.env.PAGE_URL ?? "http://127.0.0.1:5197/";
export const read = (f) => fs.readFileSync(f, "utf8").trim().split("\n");
export const base = (ip, net) => `https://${ip}:${net === "mainnet" ? 443 : 1443}`;
export async function open() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const failures = [];
  page.on("requestfailed", (r) => failures.push({ url: r.url(), err: r.failure()?.errorText }));
  const consoleErrs = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
  await page.goto(URL_PAGE);
  await page.waitForFunction(() => window.ready === true);
  return { browser, page, failures, consoleErrs, version: browser.version() };
}
export const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
