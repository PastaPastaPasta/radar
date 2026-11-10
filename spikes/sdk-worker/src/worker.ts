import * as Comlink from 'comlink';
import { EvoSDK } from '@dashevo/evo-sdk';
import { installFetchLog, captureWasmMemory, wasmMemory, netLog, tamper, type NetEntry } from './netlog';
import { plain, hex } from './convert';
import { OPS, type OpName } from './ops';

installFetchLog();
captureWasmMemory();

export type Network = 'mainnet' | 'testnet';

export interface ConnectOptions {
  /** Replace the network's DAPI node list (skips the masternode discovery request). */
  addresses?: string[];
  /** Quorum-key service base URL; defaults to quorums.<net>.networks.dash.org. */
  quorumUrl?: string;
  /** Ask nodes for proofs on plain calls (SDK default true). */
  proofs?: boolean;
  settings?: { connectTimeoutMs?: number; timeoutMs?: number; retries?: number; banFailedAddress?: boolean };
}

export interface ReadOptions {
  /** Hard cap per call. The SDK's own timeout is not reliable in browsers (a black-holed node can hang ~60-130 s). */
  timeoutMs?: number;
}

export interface ProofMeta {
  height: bigint;
  coreChainLockedHeight: number;
  epoch: number;
  timeMs: bigint;
  protocolVersion: number;
  chainId: string; // hex
  quorumHash: string; // hex
  quorumType: number;
  round: number;
  blockIdHash: string; // hex
  signature: string; // hex (BLS)
  proofSize: number; // grovedb proof bytes
  /** true = the call went through the WithProof path, which only resolves after wasm has verified
   *  the grovedb proof and the quorum signature against the trusted context. */
  verified: true;
}

export type ConnectResult =
  | { ok: true; reused: true }
  | { ok: true; reused: false; wasmInitMs: number; connectMs: number; requests: { url: string; resBytes: number; ms: number }[] }
  | { ok: false; error: ErrorShape; ms: number };

export type ReadResult<T = unknown> =
  | { ok: true; network: Network; op: string; data: T; proof: ProofMeta | null; ms: number; wireBytes: number }
  | { ok: false; network: Network; op: string; error: ErrorShape; ms: number };

export interface ErrorShape {
  name: string;
  message: string;
  kind?: unknown; // wasm SDK error category when present
  code?: unknown;
  retriable?: unknown;
}

interface Session { sdk: EvoSDK; options: ConnectOptions; connectedAt: number }
const sessions = new Map<Network, Session>();

function shapeError(e: any): ErrorShape {
  return {
    name: e?.name ?? typeof e,
    message: String(e?.message ?? e),
    kind: e?.kind,
    code: e?.code,
    retriable: typeof e?.isRetriable === 'boolean' ? e.isRetriable : e?.isRetriable?.(),
  };
}

function proofMeta(r: any): ProofMeta | null {
  const m = r?.metadata, p = r?.proof;
  if (!m || !p) return null;
  const out: ProofMeta = {
    height: m.height, coreChainLockedHeight: m.coreChainLockedHeight, epoch: m.epoch, timeMs: m.timeMs,
    protocolVersion: m.protocolVersion, chainId: hex(m.chainId),
    quorumHash: hex(p.quorumHash), quorumType: p.quorumType, round: p.round,
    blockIdHash: hex(p.blockIdHash), signature: hex(p.signature), proofSize: p.grovedbProof.length,
    verified: true,
  };
  return out;
}

async function getSession(network: Network): Promise<Session> {
  const s = sessions.get(network);
  if (!s) throw new Error(`network ${network} is not connected; call connect() first`);
  return s;
}

const api = {
  /** Idempotent per network. Returns phase timings. Reconnect with different options by dispose() first. */
  async connect(network: Network, options: ConnectOptions = {}): Promise<ConnectResult> {
    if (sessions.has(network)) return { ok: true, reused: true };
    const t0 = performance.now();
    const n0 = netLog.length;
    let tWasm = t0;
    try {
      await EvoSDK.getLatestVersionNumber(); // public hook that awaits the one-time wasm init
      tWasm = performance.now();
      const sdk = new EvoSDK({ network, trusted: true, ...options });
      await sdk.connect(); // trusted-context prefetch (quorum keys [+ node discovery]) + builder.build()
      sessions.set(network, { sdk, options, connectedAt: Date.now() });
      return {
        ok: true, reused: false,
        wasmInitMs: tWasm - t0, connectMs: performance.now() - tWasm,
        requests: netLog.slice(n0).map((e) => ({ url: e.url, resBytes: e.resBytes, ms: Math.round(e.ms) })),
      };
    } catch (e) {
      return { ok: false, error: shapeError(e), ms: performance.now() - t0 };
    }
  },

  dispose(network: Network): boolean {
    const s = sessions.get(network);
    if (!s) return false;
    (s.sdk.wasm as any).free?.();
    sessions.delete(network);
    return true;
  },

  /** Proof-verified read. Never throws across the boundary: errors come back in the envelope. */
  async read<T = unknown>(network: Network, op: OpName, params: any = {}, opts: ReadOptions = {}): Promise<ReadResult<T>> {
    const t0 = performance.now();
    const n0 = netLog.length;
    try {
      const { sdk } = await getSession(network);
      const resp = await withTimeout(OPS[op].proved(sdk, params), opts.timeoutMs ?? 15_000);
      const proof = proofMeta(resp);
      const o = OPS[op] as { shape?: (d: any) => any };
      const data = o.shape ? o.shape(plain(resp.data)) : plain(resp.data);
      resp.free?.();
      return { ok: true, network, op, data, proof, ms: performance.now() - t0, wireBytes: sumBytes(n0) };
    } catch (e) {
      return { ok: false, network, op, error: shapeError(e), ms: performance.now() - t0 };
    }
  },

  /** Plain (non-WithProof) variant, spike-only: used to test whether wasm verifies anyway. */
  async readPlain<T = unknown>(network: Network, op: OpName, params: any = {}): Promise<ReadResult<T>> {
    const t0 = performance.now();
    const n0 = netLog.length;
    try {
      const { sdk } = await getSession(network);
      const fn = (OPS[op] as any).plain;
      const o = OPS[op] as { shape?: (d: any) => any };
      const raw = plain(await fn(sdk, params));
      const data = o.shape ? o.shape(raw) : raw;
      return { ok: true, network, op, data, proof: null, ms: performance.now() - t0, wireBytes: sumBytes(n0) };
    } catch (e) {
      return { ok: false, network, op, error: shapeError(e), ms: performance.now() - t0 };
    }
  },

  stats() {
    const pm = (performance as any).memory;
    return {
      wasmMemoryBytes: wasmMemory.current?.buffer.byteLength ?? null,
      jsHeapUsed: pm?.usedJSHeapSize ?? 0,
      jsHeapTotal: pm?.totalJSHeapSize ?? 0,
      sessions: [...sessions.keys()],
    };
  },

  netLog(clear = false): NetEntry[] {
    const out = netLog.slice();
    if (clear) netLog.length = 0;
    return out;
  },

  /** Spike-only: corrupt one byte of every Platform gRPC response to see where verification happens. */
  setTamper(on: boolean, fraction = 0.5) { tamper.on = on; tamper.fraction = fraction; },

  ops(): string[] { return Object.keys(OPS); },
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(`no answer within ${ms} ms`), { name: 'Timeout' })), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function sumBytes(from: number): number {
  return netLog.slice(from).filter((e) => e.url.includes('Platform')).reduce((a, e) => a + Math.max(e.resBytes, 0), 0);
}

export type RadarSdkApi = typeof api;
Comlink.expose(api);
