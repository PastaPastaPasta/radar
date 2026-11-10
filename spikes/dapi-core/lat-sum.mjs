import fs from "fs";
const {out}=JSON.parse(fs.readFileSync("results-latency.json"));
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
const agg={};
for(const r of out){ if(r.m==="burst10") continue; const k=r.net+" "+r.m; (agg[k]??={warm:[],first:[],n:0,bytes:r.bytes}); agg[k].warm.push(...r.ms.slice(1)); agg[k].first.push(r.first); agg[k].n+=r.ms.length;}
for(const k in agg){const a=agg[k];console.log(k,"calls",a.n,"warm p50",q(a.warm,.5).toFixed(0),"p90",q(a.warm,.9).toFixed(0),"p99",q(a.warm,.99).toFixed(0),"| first-call p50",q(a.first,.5).toFixed(0),"p90",q(a.first,.9).toFixed(0),"| bytes",a.bytes)}
console.log("burst10 totals",out.filter(r=>r.m==="burst10").map(r=>r.net+":"+r.total.toFixed(0)).join(" "));
