import { open, base } from "./lib.mjs";
const { browser, page, failures } = await open();
const u = base("89.35.131.219", "mainnet") + "/";
for (const body of [{ jsonrpc: "2.0", id: 1, method: "getBestBlockHash", params: {} }, { jsonrpc: "2.0", id: 2, method: "getBlockHash", params: { height: 2569988 } }]) {
  const r = await page.evaluate(async ([u, b]) => { const t = performance.now(); try { const res = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { ms: Math.round(performance.now() - t), status: res.status, rl: res.headers.get("ratelimit-remaining"), body: (await res.text()).slice(0, 200) }; } catch (e) { return { err: String(e) }; } }, [u, body]);
  console.log(body.method, JSON.stringify(r));
}
console.log(failures);
await browser.close();
