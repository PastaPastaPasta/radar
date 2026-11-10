import fs from "fs";
import { q } from "./lib.mjs";
const { out, failures } = JSON.parse(fs.readFileSync("results-fleet.json"));
const fmt = (a) => a.length ? `n=${a.length} p50=${q(a,.5).toFixed(0)} p90=${q(a,.9).toFixed(0)} p99=${q(a,.99).toFixed(0)} max=${Math.max(...a).toFixed(0)}` : "-";
const fl = {}; failures.forEach(f => { fl[f.err] = (fl[f.err]||0)+1; });
console.log("requestfailed events:", JSON.stringify(fl));
for (const net in out) {
  const rows = out[net]; const ok = rows.filter(r => r.cold.ok);
  const by = {}; rows.forEach(r => { const k = r.cold.ok ? "ok" : (r.cold.err.code + ":" + r.cold.err.msg.slice(0,60)); by[k]=(by[k]||0)+1; });
  const st = {}; rows.forEach(r => { const k = r.status + "/reach=" + r.reach + "/" + (r.cold.ok?"ok":"fail"); st[k]=(st[k]||0)+1; });
  console.log("\n##", net, "evo nodes (ipv4):", rows.length, "ok:", ok.length, (100*ok.length/rows.length).toFixed(1)+"%");
  console.log(JSON.stringify(by, null, 1)); console.log(JSON.stringify(st, null, 1));
  const hs = {}; ok.forEach(r => hs[r.cold.body.height] = (hs[r.cold.body.height]||0)+1); console.log("heights", JSON.stringify(hs));
  console.log("cold ms", fmt(ok.map(r=>r.cold.ms))); console.log("warm ms", fmt(ok.filter(r=>r.warm?.ok).map(r=>r.warm.ms)));
  // enabled+reachable only
  const er = rows.filter(r => r.status==="enabled" && r.reach);
  console.log("enabled&reachable:", er.length, "ok", er.filter(r=>r.cold.ok).length, (100*er.filter(r=>r.cold.ok).length/er.length).toFixed(1)+"%");
  console.log("cold(enabled&reach)", fmt(er.filter(r=>r.cold.ok).map(r=>r.cold.ms)), "warm", fmt(er.filter(r=>r.warm?.ok).map(r=>r.warm.ms)));
  const rl = ok.map(r=>r.cold.headers?.["ratelimit-limit"]); const rlc={}; rl.forEach(x=>rlc[x]=(rlc[x]||0)+1); console.log("ratelimit-limit header values", JSON.stringify(rlc));
  console.log("bytes", ok[0].cold.bytes);
}
