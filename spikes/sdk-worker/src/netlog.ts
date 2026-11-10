// Wraps self.fetch inside the worker so we can see what the wasm SDK sends over the wire,
// and (spike only) corrupt a response to prove whether verification happens in wasm.
export interface NetEntry { url: string; reqBytes: number; resBytes: number; status: number; ms: number; tampered?: boolean }

export const netLog: NetEntry[] = [];
export const tamper = { on: false, fraction: 0.5, match: /\/org\.dash\.platform\.dapi\.v0\.Platform\// };

export function installFetchLog(): void {
  const orig = self.fetch.bind(self);
  self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let reqBytes = 0;
    const b = init?.body as unknown;
    if (b instanceof Uint8Array) reqBytes = b.byteLength;
    else if (typeof b === 'string') reqBytes = b.length;
    const res = await orig(input as RequestInfo, init);
    if (tamper.on && tamper.match.test(url)) {
      const buf = new Uint8Array(await res.arrayBuffer());
      buf[Math.floor(buf.length * tamper.fraction)] ^= 0xff;
      netLog.push({ url, reqBytes, resBytes: buf.length, status: res.status, ms: performance.now() - t0, tampered: true });
      return withUrl(new Response(buf, { status: res.status, headers: res.headers }), res.url);
    }
    const entry: NetEntry = { url, reqBytes, resBytes: 0, status: res.status, ms: performance.now() - t0 };
    netLog.push(entry);
    if (!res.body) return res;
    const counted = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) { entry.resBytes += chunk.byteLength; ctl.enqueue(chunk); },
      flush() { entry.ms = performance.now() - t0; },
    }));
    return withUrl(new Response(counted, { status: res.status, statusText: res.statusText, headers: res.headers }), res.url);
  };
}

// reqwest-wasm parses Response.url, which is empty on a synthetic Response.
function withUrl(r: Response, url: string): Response {
  Object.defineProperty(r, 'url', { value: url });
  return r;
}

export const wasmMemory: { current?: WebAssembly.Memory } = {};
/** Spike-only: remember the SDK instance's linear memory so stats() can report its size. */
export function captureWasmMemory(): void {
  const grab = (r: any) => { const m = r?.instance?.exports?.memory ?? r?.exports?.memory; if (m instanceof WebAssembly.Memory) wasmMemory.current = m; return r; };
  const inst = WebAssembly.instantiate.bind(WebAssembly);
  (WebAssembly as any).instantiate = (...a: any[]) => (inst as any)(...a).then(grab);
  const isr = WebAssembly.instantiateStreaming?.bind(WebAssembly);
  if (isr) (WebAssembly as any).instantiateStreaming = (...a: any[]) => (isr as any)(...a).then(grab);
}
