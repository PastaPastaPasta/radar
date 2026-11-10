import { open, base } from "./lib.mjs";
const { browser, page, failures } = await open();
const run = async (net, ip, m, r) => {
  const res = await page.evaluate(([u, m, r]) => window.dapi.unary(u, m, r), [base(ip, net), m, r]);
  console.log(net, ip, m, JSON.stringify(r), res.ok ? `ok ${res.ms.toFixed(0)}ms ${res.bytes}B ${JSON.stringify(res.body).slice(0, 300)}` : `ERR ${JSON.stringify(res.err)}`);
  return res;
};
const M = "81.14.228.87", T = "68.67.122.17";
await run("mainnet", M, "getTransaction", { id: "4f7f9464c524f70f153b284c47855a054ce7c787be3ac5bdf2029c164c4f62fc" });
await run("mainnet", M, "getTransaction", { id: "fbcf59eb9c21f4f23094101d2cf0ac3c58db9825dcc78dbb37395b4af5c87d44" });
await run("mainnet", M, "getTransaction", { id: "00".repeat(32) });
await run("mainnet", M, "getTransaction", { id: "xyz" });
await run("mainnet", M, "getBlock", { block: { case: "hash", value: "000000000000001ba106dbf586a6d6e54c3c077a5fc894960896a83b4bda525c" } });
await run("mainnet", M, "getBlock", { block: { case: "height", value: 999999999 } });
await run("testnet", T, "getTransaction", { id: "5887bdd9b47a1a892c13c0915e9e3b59140dc7bf80837579deef4ec5aa1a4062" });
const g = await run("testnet", T, "getBlock", { block: { case: "height", value: 1 } });
// testnet genesis hash
await run("testnet", T, "getBlock", { block: { case: "hash", value: "00000bafbc94add76cb75e2ec92894837288a481e5c005f6563d91623bf8bc2c" } });
console.log(failures);
await browser.close();
