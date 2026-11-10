// Sequential latency per method per node in a real browser (>=20 calls per method per node, within the 150/min budget).
import { open, base, q } from "./lib.mjs";
import fs from "fs";
const { browser, page, failures } = await open();
const sel = { mainnet: ["81.14.228.87", "65.108.74.75", "89.35.131.219", "173.212.196.214", "103.214.68.131", "5.199.166.140"], testnet: ["68.67.122.17", "68.67.122.9", "85.209.243.2"] };
const heights = { mainnet: 2569988, testnet: 1589116 };
const out = [];
for (const net of Object.keys(sel)) for (const ip of sel[net]) {
  const u = base(ip, net);
  const plan = [["getBestBlockHeight", {}, 25], ["getBlockchainStatus", {}, 20], ["getBlock", { block: { case: "height", value: heights[net] } }, 20]];
  for (const [m, r, n] of plan) {
    const ms = [], bytes = [], errs = [];
    for (let i = 0; i < n; i++) {
      const x = await page.evaluate(([u, m, r]) => window.dapi.unary(u, m, r), [u, m, r]);
      if (x.ok) { ms.push(x.ms); bytes.push(x.bytes); } else errs.push(x.err.code);
    }
    out.push({ net, ip, m, n, ok: ms.length, first: ms[0], ms, bytes: bytes[0], errs });
    console.log(net, ip, m, "n", ms.length, "first", ms[0]?.toFixed(0), "p50", q(ms.slice(1), .5)?.toFixed(0), "p90", q(ms.slice(1), .9)?.toFixed(0), "B", bytes[0], errs.length ? errs : "");
  }
  // burst of 10 parallel
  const t = Date.now();
  const rs = await page.evaluate(async ([u]) => { const t0 = performance.now(); const r = await Promise.all(Array.from({ length: 10 }, () => window.dapi.unary(u, "getBestBlockHeight", {}))); return { total: performance.now() - t0, ok: r.filter((x) => x.ok).length, ms: r.map((x) => x.ms) }; }, [u]);
  out.push({ net, ip, m: "burst10", ...rs });
  console.log(net, ip, "burst10 parallel total ms", rs.total.toFixed(0), "ok", rs.ok);
}
fs.writeFileSync("results-latency.json", JSON.stringify({ out, failures }, null, 1));
console.log("failures", failures);
await browser.close();
