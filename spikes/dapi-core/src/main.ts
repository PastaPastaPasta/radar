import { create, toJson, type DescMessage } from "@bufbuild/protobuf";
import { ConnectError, Code } from "@connectrpc/connect";
import { Core } from "./gen/core/v0/core_pb";
import { createNode, type DapiNode } from "./dapi";

const nodes = new Map<string, DapiNode>();
const getNode = (baseUrl: string, measure: boolean) => {
  const k = baseUrl + measure;
  if (!nodes.has(k)) nodes.set(k, createNode(baseUrl, { measureBody: measure }));
  return nodes.get(k)!;
};

const BYTES_KEYS = ["vData", "fromBlockHash"];
function fixBytes(o: any): any {
  if (Array.isArray(o)) return o;
  if (o && typeof o === "object") {
    if (typeof o.case === "string" && BYTES_KEYS.includes(o.case) && Array.isArray(o.value)) o.value = Uint8Array.from(o.value);
    for (const k of Object.keys(o)) {
      if (BYTES_KEYS.includes(k) && Array.isArray(o[k])) o[k] = Uint8Array.from(o[k]);
      else if (k === "block" || k === "fromBlock") o[k] = fixBytes(o[k]);
      else if (o[k] && typeof o[k] === "object") o[k] = fixBytes(o[k]);
    }
  }
  return o;
}
function shrink(v: any): any {
  if (typeof v === "string" && v.length > 100) return `<${v.length} chars>`;
  if (Array.isArray(v)) return v.map(shrink);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrink(x)]));
  return v;
}
function errInfo(e: unknown) {
  const ce = ConnectError.from(e);
  const md: Record<string, string> = {};
  ce.metadata.forEach((v, k) => (md[k] = v));
  return { code: Code[ce.code], rawMessage: ce.rawMessage, metadata: md, name: (e as Error)?.name, msg: String((e as Error)?.message).slice(0, 200) };
}

const methodSchema = (m: string) => {
  const mm = (Core.method as any)[m];
  return mm.input as DescMessage;
};

(window as any).dapi = {
  async unary(baseUrl: string, method: string, req: any = {}, timeoutMs = 15000) {
    const node = getNode(baseUrl, true);
    const t0 = performance.now();
    try {
      const msg = create(methodSchema(method), fixBytes(req));
      const res: any = await (node.client as any)[method](msg, { timeoutMs });
      const ms = performance.now() - t0;
      const p = node.lastProbe();
      return { ok: true, ms, status: p.status, bytes: p.bytes, headers: p.headers, body: shrink(toJson(Core.method[method as keyof typeof Core.method].output as DescMessage, res)) };
    } catch (e) {
      const ms = performance.now() - t0;
      const p = node.lastProbe();
      return { ok: false, ms, status: p.status, headers: p.headers, err: errInfo(e) };
    }
  },

  /** Open a server stream; collect message arrival times until maxMs or maxMsgs, then abort. */
  async stream(baseUrl: string, method: string, req: any = {}, maxMs = 20000, maxMsgs = 50) {
    const node = getNode(baseUrl, false);
    const ac = new AbortController();
    const t0 = performance.now();
    const msgs: { t: number; kind: string; size: number }[] = [];
    let err: any = null, ended = false;
    const timer = setTimeout(() => ac.abort(), maxMs);
    try {
      const msg = create(methodSchema(method), fixBytes(req));
      for await (const m of (node.client as any)[method](msg, { signal: ac.signal, timeoutMs: undefined }) as AsyncIterable<any>) {
        const j: any = toJson(Core.method[method as keyof typeof Core.method].output as DescMessage, m);
        const kind = Object.keys(j)[0] ?? "empty";
        msgs.push({ t: Math.round(performance.now() - t0), kind, size: JSON.stringify(j).length });
        if (msgs.length >= maxMsgs) { ac.abort(); break; }
      }
      ended = true;
    } catch (e) {
      const ci = errInfo(e);
      if (!(ac.signal.aborted && ci.code === "Canceled")) err = ci;
    }
    clearTimeout(timer);
    const p = node.lastProbe();
    return { elapsed: Math.round(performance.now() - t0), msgs, err, endedByServer: ended, status: p.status, headers: p.headers };
  },
};
(window as any).ready = true;
