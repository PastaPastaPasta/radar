// Reusable: Connect gRPC-web transport + typed Core client for a DAPI evonode.
import { createClient, type Interceptor, type Client } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { Core } from "./gen/core/v0/core_pb";

export type NetworkName = "mainnet" | "testnet";
export const DAPI_PORT: Record<NetworkName, number> = { mainnet: 443, testnet: 1443 };

export interface FetchProbe {
  status?: number;
  headers?: Record<string, string>;
  bytes?: number; // body bytes (unary only; streams are not buffered)
}

export interface DapiNode {
  baseUrl: string;
  client: Client<typeof Core>;
  lastProbe: () => FetchProbe;
}

export function nodeUrl(ip: string, net: NetworkName): string {
  return `https://${ip}:${DAPI_PORT[net]}`;
}

/** Transport that records status + response headers (readable thanks to CORS expose_headers). */
export function createNode(baseUrl: string, opts: { measureBody?: boolean; interceptors?: Interceptor[] } = {}): DapiNode {
  let probe: FetchProbe = {};
  const probingFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    probe = { status: res.status, headers };
    if (opts.measureBody) {
      const buf = await res.clone().arrayBuffer();
      probe.bytes = buf.byteLength;
    }
    return res;
  };
  const transport = createGrpcWebTransport({
    baseUrl,
    useBinaryFormat: true,
    fetch: probingFetch,
    interceptors: opts.interceptors,
  });
  return { baseUrl, client: createClient(Core, transport), lastProbe: () => probe };
}
