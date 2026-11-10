// All unary methods on a handful of mainnet + testnet evonodes, in a real browser.
import { open, read, base } from "./lib.mjs";
import fs from "fs";
const { browser, page, failures, version } = await open();
const sel = {
  mainnet: process.env.MAIN?.split(",") ?? read("evo-main.txt").filter((_, i) => i % 60 === 7).slice(0, 6),
  testnet: process.env.TEST?.split(",") ?? read("evo-test.txt").filter((_, i) => i % 10 === 3).slice(0, 4),
};
const out = { chromium: version, calls: [] };
const call = async (net, ip, m, r) => {
  const res = await page.evaluate(([u, m, r]) => window.dapi.unary(u, m, r), [base(ip, net), m, r]);
  out.calls.push({ net, ip, m, r, ...res });
  return res;
};
for (const net of Object.keys(sel)) {
  for (const ip of sel[net]) {
    const st = await call(net, ip, "getBlockchainStatus", {});
    const h = st.ok ? st.body.chain.blocksCount : null;
    const bh = await call(net, ip, "getBestBlockHeight", {});
    await call(net, ip, "getBlock", { block: { case: "height", value: (h ?? 1000) - 5 } });
    const best = st.ok ? st.body.chain : null;
    await call(net, ip, "getMasternodeStatus", {});
    await call(net, ip, "getEstimatedTransactionFee", { blocks: 2 });
    await call(net, ip, "getBlock", { block: { case: "height", value: 0 } });
    console.log(net, ip, "status", st.ok, "h", h, "bestheight", bh.ok && bh.body.height);
  }
}
fs.writeFileSync("results-methods.json", JSON.stringify({ ...out, failures }, null, 1));
for (const c of out.calls) console.log(c.net, c.ip, c.m, JSON.stringify(c.r), c.ok ? `ok ${c.ms.toFixed(0)}ms ${c.bytes}B` : `ERR ${c.err.code} ${c.err.rawMessage}`);
console.log("failures", failures);
await browser.close();
