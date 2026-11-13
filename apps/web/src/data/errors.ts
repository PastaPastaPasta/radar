import type { SourceId } from './envelope'

export type SourceErrorKind =
  | 'network' // fetch failed, CORS, TLS, DNS, refused
  | 'timeout'
  | 'http' // non-2xx other than 404/429
  | 'rate-limited' // HTTP 429 or gRPC RESOURCE_EXHAUSTED (8)
  | 'invalid-response' // zod or protobuf decode failure
  | 'proof-failed' // SDK returned a proof that did not verify
  | 'unavailable' // source not offered on this network (devnet), or health is 'down' and the call was skipped
  | 'disabled-by-mode' // a hosted source, refused before any request because Decentralized only mode is on
  | 'aborted'

export interface SourceErrorInit {
  source: SourceId
  kind: SourceErrorKind
  message: string
  status?: number
  retryAfterMs?: number
  node?: string
  cause?: unknown
  /** A timeout that fell while the reply was still arriving: a slow link, not a failing node. */
  bytesFlowing?: boolean
}

export class SourceError extends Error {
  readonly source: SourceId
  readonly kind: SourceErrorKind
  readonly status?: number // HTTP status or gRPC code
  readonly retryAfterMs?: number
  readonly node?: string
  readonly bytesFlowing?: boolean
  constructor(init: SourceErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'SourceError'
    this.source = init.source
    this.kind = init.kind
    this.status = init.status
    this.retryAfterMs = init.retryAfterMs
    this.node = init.node
    this.bytesFlowing = init.bytesFlowing
  }
}

export function isSourceError(e: unknown): e is SourceError {
  return e instanceof SourceError
}

export function abortedError(source: SourceId): SourceError {
  return new SourceError({ source, kind: 'aborted', message: 'The request was aborted' })
}

/** A hosted source refused before any network I/O because Decentralized only mode is on. Not an outage. */
export function disabledByMode(source: SourceId): SourceError {
  return new SourceError({
    source,
    kind: 'disabled-by-mode',
    message: `${source} is a hosted service; Decentralized only mode reads only DAPI and the Platform SDK`,
  })
}

export function isDisabledByMode(e: unknown): boolean {
  return isSourceError(e) && e.kind === 'disabled-by-mode'
}
