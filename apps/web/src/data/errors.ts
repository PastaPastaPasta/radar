import type { SourceId } from './envelope'

export type SourceErrorKind =
  | 'network' // fetch failed, CORS, TLS, DNS, refused
  | 'timeout'
  | 'http' // non-2xx other than 404/429
  | 'rate-limited' // HTTP 429 or gRPC RESOURCE_EXHAUSTED (8)
  | 'invalid-response' // zod or protobuf decode failure
  | 'proof-failed' // SDK returned a proof that did not verify
  | 'unavailable' // source not offered on this network (devnet), or health is 'down' and the call was skipped
  | 'aborted'

export interface SourceErrorInit {
  source: SourceId
  kind: SourceErrorKind
  message: string
  status?: number
  retryAfterMs?: number
  node?: string
  cause?: unknown
}

export class SourceError extends Error {
  readonly source: SourceId
  readonly kind: SourceErrorKind
  readonly status?: number // HTTP status or gRPC code
  readonly retryAfterMs?: number
  readonly node?: string
  constructor(init: SourceErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'SourceError'
    this.source = init.source
    this.kind = init.kind
    this.status = init.status
    this.retryAfterMs = init.retryAfterMs
    this.node = init.node
  }
}

export function isSourceError(e: unknown): e is SourceError {
  return e instanceof SourceError
}
