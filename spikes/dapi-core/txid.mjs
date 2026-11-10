// Dev helper: fetch a block via raw grpc-web from node (no browser) and print txid of coinbase + a later tx.
import crypto from "crypto";
const [ip, port, height] = process.argv.slice(2);
const varint = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return o; };
const msg = Buffer.from([0x08, ...varint(+height)]);
const frame = Buffer.concat([Buffer.from([0, 0, 0, 0, msg.length]), msg]);
const r = await fetch(`https://${ip}:${port}/org.dash.platform.dapi.v0.Core/getBlock`, { method: "POST", headers: { "content-type": "application/grpc-web+proto", "x-grpc-web": "1" }, body: frame });
const b = Buffer.from(await r.arrayBuffer());
const len = b.readUInt32BE(1); let m = b.subarray(5, 5 + len);
// field 1 bytes
let p = 1; let l = 0, sh = 0; while (true) { const c = m[p++]; l |= (c & 127) << sh; if (!(c & 128)) break; sh += 7; }
const blk = m.subarray(p, p + l);
let o = 80; const rv = () => { const c = blk[o++]; if (c < 0xfd) return c; if (c === 0xfd) { const v = blk.readUInt16LE(o); o += 2; return v; } const v = blk.readUInt32LE(o); o += 4; return v; };
const ntx = rv(); const txs = [];
const sha = (x) => crypto.createHash("sha256").update(x).digest();
for (let i = 0; i < Math.min(ntx, 3); i++) {
  const s = o; const ver = blk.readUInt16LE(o); const type = blk.readUInt16LE(o + 2); o += 4;
  const nin = rv(); for (let k = 0; k < nin; k++) { o += 36; const sl = rv(); o += sl + 4; }
  const nout = rv(); for (let k = 0; k < nout; k++) { o += 8; const sl = rv(); o += sl; }
  o += 4;
  if (ver >= 3 && type !== 0) { const pl = rv(); o += pl; }
  const raw = blk.subarray(s, o); txs.push(Buffer.from(sha(sha(raw))).reverse().toString("hex"));
}
console.log(JSON.stringify({ height: +height, ntx, txs, blockBytes: blk.length }));
