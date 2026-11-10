import { classify, type Classified } from '@/features/search'
import type { NetworkId } from '@/lib/network'

export const MAX_SCAN_CHARS = 200

export type ScanOutcome =
  | { kind: 'search'; query: string; classified: Classified }
  | { kind: 'refused' }
  | { kind: 'unreadable' }

/** `dash:XaDDR?amount=1` and `dash://XaDDR` carry the address in front of the query. */
function unwrapPaymentUri(text: string): string {
  const m = /^(?:dash|tdash):(?:\/\/)?([^?#]+)/i.exec(text)
  return m?.[1] ?? text
}

/**
 * What to do with text read from a QR code. It goes through the same classifier as the search box: a
 * private key or recovery phrase is refused without being kept, shown or put in a URL, and only what
 * the classifier recognises as something to look up becomes a search.
 */
export function interpretScan(raw: string, net: NetworkId): ScanOutcome {
  const text = raw.trim()
  if (text === '') return { kind: 'unreadable' }
  if (classify(text, net).warning) return { kind: 'refused' }
  const inner = unwrapPaymentUri(text)
  const classified = classify(inner, net)
  if (classified.warning) return { kind: 'refused' }
  if (inner.length > MAX_SCAN_CHARS || classified.classes.length === 0) {
    return { kind: 'unreadable' }
  }
  return { kind: 'search', query: classified.normalized, classified }
}
