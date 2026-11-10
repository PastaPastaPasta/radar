import { open, read, base } from "./lib.mjs";
const { browser, page, failures, version } = await open();
console.log("chromium", version);
const ip = read("evo-main.txt")[0];
const u = base(ip, "mainnet");
for (const [m, r] of [["getBlockchainStatus",{}],["getBestBlockHeight",{}],["getMasternodeStatus",{}],["getEstimatedTransactionFee",{blocks:2}],["getBlock",{height:1}]]) {
  const res = await page.evaluate(([u,m,r]) => window.dapi.unary(u,m,r), [u,m,r]);
  console.log(m, JSON.stringify(res).slice(0, 900));
}
console.log(failures);
await browser.close();
