import { open } from "./lib.mjs";
const { browser, page, failures } = await open();
const seeds = [["mainnet", 1, 443], ["mainnet", 2, 443], ["mainnet", 3, 443], ["mainnet", 4, 443], ["testnet", 1, 1443], ["testnet", 2, 1443], ["testnet", 3, 1443], ["testnet", 4, 1443], ["testnet", 5, 1443]];
for (const [net, n, port] of seeds) {
  const h = `seed-${n}.${net}.networks.dash.org`; const u = `https://${h}:${port}`;
  const rs = []; for (let i = 0; i < 3; i++) rs.push(await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}, 10000), u));
  console.log(h, rs.map((r) => r.ok ? `${r.ms.toFixed(0)}ms h=${r.body.height} rl=${r.headers?.["ratelimit-remaining"] ?? "-"}` : "ERR " + r.err.code + " " + r.err.rawMessage).join(" | "));
}
console.log(failures);
await browser.close();
