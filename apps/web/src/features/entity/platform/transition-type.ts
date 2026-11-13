import { BATCH_TYPES, TRANSITION_TYPES, type BatchType, type TransitionType } from '@/lib/tx-types'

const kebab = (raw: string) => raw.toLowerCase().replaceAll('_', '-')

const isTransition = (v: string): v is TransitionType =>
  (TRANSITION_TYPES as readonly string[]).includes(v)
const isBatch = (v: string): v is BatchType => (BATCH_TYPES as readonly string[]).includes(v)

/**
 * The badge type for a Platform Explorer transition: `IDENTITY_TOP_UP` is `identity-top-up`, and a `BATCH` is what it
 * does (`DOCUMENT_CREATE`) when Explorer says. Undefined for a type this build does not know; the caller then shows
 * `humanize(type)` in a plain badge.
 */
export function transitionBadgeType(
  type: string,
  batchType?: string | number | null,
): TransitionType | BatchType | undefined {
  const base = kebab(type)
  if (base === 'batch' && typeof batchType === 'string') {
    const inner = kebab(batchType)
    if (isBatch(inner)) return inner
  }
  return isTransition(base) ? base : undefined
}

/** `SOME_NEW_TYPE` as "Some new type". */
export function humanizeType(raw: string): string {
  const text = raw.toLowerCase().split('_').join(' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
