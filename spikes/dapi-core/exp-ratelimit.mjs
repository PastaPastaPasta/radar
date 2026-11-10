// Gently push ONE node past its 150/min limit from this IP, stop at the first limit response, poll for recovery.
import { open, base } from "./lib.mjs";
import fs from "fs";
const [net, ip] = process.argv.slice(2);
const { browser, page, failures } = await open();
const u = base(ip, net);
const log = [];
const t0 = Date.now();
let limited = null;
for (let i = 1; i <= 400 && !limited; i++) {
  const r = await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}, 15000), u);
  const row = { i, t: Date.now() - t0, ok: r.ok, ms: Math.round(r.ms), status: r.status, rem: r.headers?.["ratelimit-remaining"], reset: r.headers?.["ratelimit-reset"], lim: r.headers?.["ratelimit-limit"], err: r.err };
  log.push(row);
  if (!r.ok) { limited = { ...row, headers: r.headers }; }
}
console.log("first failure:", JSON.stringify(limited));
const tHit = Date.now();
const recov = [];
let recovered = null;
if (limited) {
  const wait = Math.min(70, (+limited.reset || 60) + 1);
  // first poll after the advertised reset, then every 5s
  await new Promise((r) => setTimeout(r, Math.max(0, wait * 1000 - 1500)));
  for (let k = 0; k < 20 && !recovered; k++) {
    const r = await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}, 15000), u);
    const row = { sinceHit: Math.round((Date.now() - tHit) / 1000), ok: r.ok, status: r.status, rem: r.headers?.["ratelimit-remaining"], reset: r.headers?.["ratelimit-reset"], err: r.err?.code };
    recov.push(row); console.log("recovery poll", JSON.stringify(row));
    if (r.ok) recovered = row; else await new Promise((r) => setTimeout(r, 5000));
  }
}
fs.writeFileSync(`results-ratelimit-${net}-${ip}.json`, JSON.stringify({ net, ip, log, limited, recov, recovered, failures }, null, 1));
console.log("requests before limit:", log.filter((l) => l.ok).length, "failures", failures);
await browser.close();
