import { create, toBinary } from '@bufbuild/protobuf'
import { GetBestBlockHeightResponseSchema } from '@/data/dapi-core/gen/core/v0/core_pb'
import { frameMessage } from '@/data/dapi-core/grpc-web'

const encoder = new TextEncoder()

export function trailerFrame(lines: Record<string, string>): Uint8Array {
  const body = encoder.encode(
    Object.entries(lines)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join(''),
  )
  const out = new Uint8Array(5 + body.length)
  out[0] = 0x80
  new DataView(out.buffer).setUint32(1, body.length)
  out.set(body, 5)
  return out
}

export function bodyOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

/** A gRPC-web reply with the given messages and a trailing `grpc-status: 0`. */
export function grpcOk(messages: Uint8Array[], headers: Record<string, string> = {}): Response {
  return new Response(bodyOf(...messages.map(frameMessage), trailerFrame({ 'grpc-status': '0' })), {
    status: 200,
    headers: { 'content-type': 'application/grpc-web+proto', ...headers },
  })
}

/** A trailers-only reply: gRPC errors travel in the HTTP headers with status 200. */
export function grpcFail(
  code: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(null, {
    status: 200,
    headers: { 'grpc-status': String(code), 'grpc-message': message, ...headers },
  })
}

export const bestHeightReply = (height: number): Uint8Array =>
  toBinary(GetBestBlockHeightResponseSchema, create(GetBestBlockHeightResponseSchema, { height }))

export interface FakeCall {
  url: string
  host: string
  method: string
  at: number
}

/**
 * A fetch that answers per node. `handlers[host]` (or `default`) returns the reply; every call is logged.
 */
export function fakeFetch(
  handler: (call: FakeCall, init: RequestInit | undefined) => Response | Promise<Response>,
  now: () => number = Date.now,
) {
  const calls: FakeCall[] = []
  const fetch = (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const call: FakeCall = {
      url: input,
      host: input.replace(/^https?:\/\//, '').split('/')[0] ?? url.host,
      method: url.pathname.split('/').pop() ?? '',
      at: now(),
    }
    calls.push(call)
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal
      const onAbort = () =>
        reject((signal!.reason ?? new DOMException('aborted', 'AbortError')) as Error)
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      Promise.resolve(handler(call, init)).then(resolve, reject)
    })
  }
  return { fetch, calls }
}

/** Never answers, until the request is aborted. */
export const hang = (): Promise<Response> => new Promise<Response>(() => undefined)
