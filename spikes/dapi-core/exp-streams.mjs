// usage: node exp-streams.mjs <net> <ip> <maxMs> <out.json>
import { open, base } from "./lib.mjs";
import fs from "fs";
const [net, ip, maxMs, outf] = process.argv.slice(2);
const { browser, page, failures } = await open();
const u = base(ip, net);
const st = await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}), u);
const h = st.body.height; console.log("tip", h);
const MATCH_ALL = { vData: [0xff], nHashFuncs: 1, nTweak: 0, nFlags: 0 };
const jobs = {
  headers: ["subscribeToBlockHeadersWithChainLocks", { fromBlock: { case: "fromBlockHeight", value: h - 3 }, count: 0 }],
  mnlist: ["subscribeToMasternodeList", {}],
  txs: ["subscribeToTransactionsWithProofs", { bloomFilter: MATCH_ALL, fromBlock: { case: "fromBlockHeight", value: h - 3 }, count: 0, sendTransactionHashes: false }],
};
const res = await Promise.all(Object.entries(jobs).map(async ([k, [m, r]]) => {
  const x = await page.evaluate(([u, m, r, ms]) => window.dapi.stream(u, m, r, ms, 100000), [u, m, r, +maxMs]);
  const kinds = {}; x.msgs.forEach((m) => (kinds[m.kind] = (kinds[m.kind] || 0) + 1));
  console.log(k, "elapsed", x.elapsed, "msgs", x.msgs.length, "firstAt", x.msgs[0]?.t, "kinds", JSON.stringify(kinds), "err", JSON.stringify(x.err), "endedByServer", x.endedByServer, "hdrs", JSON.stringify(x.headers));
  return [k, x];
}));
fs.writeFileSync(outf, JSON.stringify({ net, ip, tip: h, res: Object.fromEntries(res), failures }, null, 1));
await browser.close();
