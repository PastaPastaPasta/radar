import type { SourceStamp } from '@/data/envelope'

export function localStamp(): SourceStamp {
  const now = Date.now()
  return { source: 'local', asOf: now, fetchedAt: now, proved: false }
}
