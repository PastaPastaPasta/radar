// One cold + one warm getBestBlockHeight against every Evo node in a real browser.
import { open, base, q } from "./lib.mjs";
import fs from "fs";
const { browser, page, failures } = await open();
const out = {};
for (const net of ["mainnet", "testnet"]) {
  const j = JSON.parse(fs.readFileSync(net === "mainnet" ? "mn-main.json" : "mn-test.json"));
  const nodes = j.masternodes.filter((x) => x.type === "Evo" && x.network === "ipv4");
  const rows = [];
  let i = 0;
  const worker = async () => {
    while (i < nodes.length) {
      const n = nodes[i++]; const ip = n.service.split(":")[0]; const u = base(ip, net);
      const cold = await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}, 15000), u);
      let warm = null;
      if (cold.ok) warm = await page.evaluate((u) => window.dapi.unary(u, "getBestBlockHeight", {}, 15000), u);
      rows.push({ ip, status: n.status, reach: n.reachable, country: n.country, cold, warm });
    }
  };
  await Promise.all(Array.from({ length: 20 }, worker));
  out[net] = rows;
  console.log(net, rows.length, "ok", rows.filter((r) => r.cold.ok).length);
}
fs.writeFileSync("results-fleet.json", JSON.stringify({ out, failures }, null, 1));
await browser.close();
