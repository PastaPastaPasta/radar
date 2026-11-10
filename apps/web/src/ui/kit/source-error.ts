import type { SourceId } from '@/data/envelope'

type Kind =
  | 'network'
  | 'rate-limited'
  | 'invalid-response'
  | 'proof-failed'
  | 'timeout'
  | 'http'
  | 'unavailable'

/** A stand-in with the same shape as the data layer's SourceError, for the kit's error states. */
export class SourceError extends Error {
  readonly source: SourceId
  readonly kind: Kind
  constructor(source: SourceId, kind: Kind, message: string) {
    super(message)
    this.name = 'SourceError'
    this.source = source
    this.kind = kind
  }
}
