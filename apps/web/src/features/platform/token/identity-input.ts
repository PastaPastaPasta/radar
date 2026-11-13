import type { QueryClient } from '@tanstack/react-query'
import { sdkQueries } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'
import { readIdentityInput } from '../identity/ids'

export type IdentityText =
  { kind: 'id'; id: string } | { kind: 'name'; name: string } | { kind: 'invalid' }

const LABEL = /^[A-Za-z0-9-]{3,63}$/

/** What a person typed for an identity: its ID (base58 or hex) or a DPNS name, with or without `.dash`. */
export function readIdentityText(raw: string): IdentityText {
  const text = raw.trim()
  if (text === '') return { kind: 'invalid' }
  const id = readIdentityInput(text)
  if (id.kind !== 'invalid') return { kind: 'id', id: id.id }
  const label = text.replace(/\.dash$/i, '')
  return LABEL.test(label) ? { kind: 'name', name: `${label}.dash` } : { kind: 'invalid' }
}

export type Resolved =
  | { ok: true; id: string; name?: string }
  | { ok: false; reason: 'invalid' | 'not-found' | 'error'; name?: string }

/** The identity a text names, asking DPNS for a name. */
export async function resolveIdentityText(
  qc: QueryClient,
  net: NetworkId,
  raw: string,
): Promise<Resolved> {
  const read = readIdentityText(raw)
  if (read.kind === 'invalid') return { ok: false, reason: 'invalid' }
  if (read.kind === 'id') return { ok: true, id: read.id }
  try {
    const answer = await qc.fetchQuery(sdkQueries['dpns.resolveName'](net, { name: read.name }))
    return answer.data
      ? { ok: true, id: answer.data, name: read.name }
      : { ok: false, reason: 'not-found', name: read.name }
  } catch {
    return { ok: false, reason: 'error', name: read.name }
  }
}
