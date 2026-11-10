import type { WireError } from '../methods'

type Failure = WireError['error']

interface SdkErrorLike {
  name?: string
  message?: string
  kind?: unknown
}

const text = (e: unknown): SdkErrorLike =>
  typeof e === 'object' && e !== null ? e : { name: typeof e, message: String(e) }

/** The wasm SDK's errors reach us as objects with a `name`, a `message` and a numeric `kind`; anything else is read by message. */
export function classify(e: unknown): Failure {
  const { name = 'Error', message = '' } = text(e)
  const lower = message.toLowerCase()
  const code = name
  if (name === 'Timeout' || name === 'TimeoutError') {
    return { kind: 'timeout', message: message || 'The Platform node did not answer in time', code }
  }
  if (name === 'InvalidArgument') return { kind: 'invalid-response', message, code }
  if (name === 'NotFound') return { kind: 'http', message, code }
  if (
    name === 'ResourceExhausted' ||
    lower.includes('resource exhausted') ||
    lower.includes('rate limit')
  ) {
    return { kind: 'rate-limited', message, code }
  }
  if (lower.includes('grovedb') || lower.includes('invalid proof') || lower.includes('signature')) {
    return { kind: 'proof-failed', message, code }
  }
  if (name === 'Proof') return { kind: 'proof-failed', message, code }
  if (
    name === 'DapiClientError' ||
    lower.includes('failed to fetch') ||
    lower.includes('failed to prefetch') ||
    lower.includes('no available addresses') ||
    lower.includes('network')
  ) {
    return { kind: 'network', message, code }
  }
  return { kind: 'http', message: message || 'The Platform SDK failed', code }
}

/** A failed attempt worth repeating once on another node: the transport faults, never a verdict about the data. */
export function isRetryable(failure: Failure): boolean {
  return failure.kind === 'timeout' || failure.kind === 'network'
}

/** The error name the SDK uses for "this entity does not exist" on calls that throw instead of returning nothing. */
export function isNotFound(e: unknown): boolean {
  const { name, message = '' } = text(e)
  return (
    name === 'NotFound' ||
    (name === 'Proof' && message.toLowerCase().includes('most likely does not exist'))
  )
}
