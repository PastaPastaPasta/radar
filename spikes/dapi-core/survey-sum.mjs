import fs from "fs";
for (const net of ["main","test"]) {
  const d = `survey/${net}`; const ips = fs.readFileSync(`evo-${net}.txt`,"utf8").trim().split("\n");
  const r = {n: ips.length, tlsOk:0, tlsFail:0, noConn:0, preOk:0, postOk:0, grpc0:0, acao:{}, other:{} , verifyCodes:{}, errs:{}};
  const times=[]; const rows=[];
  for (const ip of ips) {
    const w = fs.readFileSync(`${d}/${ip}.post.w`,"utf8").trim(); const m = w.match(/^(\d+) conn=([\d.]+) tls=([\d.]+) total=([\d.]+) verify=(\d+) err=(.*)$/);
    const pw = fs.readFileSync(`${d}/${ip}.pre.w`,"utf8").trim(); const pm = pw.match(/^(\d+) /);
    if (!m || m[1]==="000") { r.noConn++; r.errs[(m?m[6]:w).slice(0,60)]=(r.errs[(m?m[6]:w).slice(0,60)]||0)+1; continue; }
    r.verifyCodes[m[5]]=(r.verifyCodes[m[5]]||0)+1;
    if (m[5]==="0") r.tlsOk++; else r.tlsFail++;
    const h = fs.readFileSync(`${d}/${ip}.post.h`,"utf8");
    const gs = (h.match(/^grpc-status: *(\d+)/mi)||[])[1];
    if (m[1]==="200" && (gs===undefined||gs==="0")) r.postOk++;
    r.other[m[1]+" gs="+gs]=(r.other[m[1]+" gs="+gs]||0)+1;
    const ph = fs.readFileSync(`${d}/${ip}.pre.h`,"utf8");
    const ao = (ph.match(/^access-control-allow-origin: *(.*)$/mi)||[])[1]?.trim();
    r.acao[(pm?pm[1]:"?")+" acao="+ao]=(r.acao[(pm?pm[1]:"?")+" acao="+ao]||0)+1;
    times.push(+m[4]);
    rows.push({ip, total:+m[4], conn:+m[2], tls:+m[3]});
  }
  times.sort((a,b)=>a-b); const q=p=>times[Math.floor(p*(times.length-1))];
  console.log(net, JSON.stringify(r,null,1), "total s p50/p90", q(.5), q(.9));
}
