// Reference node pool for Radar: candidate list -> pick -> call -> ban/failover.
// Not exercised by the experiments; mirrors what the measurements recommend (see REPORT.md).
import { Code, ConnectError } from "@connectrpc/connect";
import { createNode, nodeUrl, type DapiNode, type NetworkName } from "./dapi";

interface NodeState {
  ip: string;
  node: DapiNode;
  ewmaMs: number;
  bannedUntil: number;
  failures: number;
  windowStart: number;
  used: number; // requests this client sent in the current 60 s window
}

const SOFT_BUDGET = 100; // of 150/min; leaves headroom for other tabs / devices behind the same NAT
const WINDOW_MS = 60_000;

export class NodePool {
  private nodes: NodeState[];
  constructor(private net: NetworkName, ips: string[]) {
    this.nodes = ips.map((ip) => ({ ip, node: createNode(nodeUrl(ip, net)), ewmaMs: 300, bannedUntil: 0, failures: 0, windowStart: 0, used: 0 }));
  }

  private usable(now: number) {
    return this.nodes.filter((n) => {
      if (n.bannedUntil > now) return false;
      if (now - n.windowStart >= WINDOW_MS) { n.windowStart = now; n.used = 0; }
      return n.used < SOFT_BUDGET;
    });
  }

  /** Pick the faster of two random usable nodes (power of two choices, so load spreads and slow nodes fade out). */
  private pick(exclude: Set<NodeState>): NodeState {
    const now = Date.now();
    const c = this.usable(now).filter((n) => !exclude.has(n));
    if (!c.length) throw new Error("no usable DAPI node");
    const a = c[Math.floor(Math.random() * c.length)], b = c[Math.floor(Math.random() * c.length)];
    return a.ewmaMs <= b.ewmaMs ? a : b;
  }

  async call<T>(fn: (c: DapiNode["client"]) => Promise<T>, attempts = 3): Promise<T> {
    const tried = new Set<NodeState>();
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      const n = this.pick(tried);
      tried.add(n);
      n.used++;
      const t0 = performance.now();
      try {
        const r = await fn(n.node.client);
        n.ewmaMs = 0.8 * n.ewmaMs + 0.2 * (performance.now() - t0);
        n.failures = 0;
        const rem = Number(n.node.lastProbe().headers?.["ratelimit-remaining"]);
        if (Number.isFinite(rem)) n.used = Math.max(n.used, 150 - rem); // sync with the server's counter
        return r;
      } catch (e) {
        last = e;
        const ce = ConnectError.from(e);
        if (ce.code === Code.ResourceExhausted) {
          const reset = Number(ce.metadata.get("ratelimit-reset")) || 60;
          n.bannedUntil = Date.now() + (reset + 1) * 1000;
        } else if (ce.code === Code.NotFound || ce.code === Code.InvalidArgument) {
          throw e; // answer from the chain, not a node fault
        } else {
          n.failures++;
          n.bannedUntil = Date.now() + Math.min(600_000, 15_000 * 2 ** n.failures);
        }
      }
    }
    throw last;
  }
}
