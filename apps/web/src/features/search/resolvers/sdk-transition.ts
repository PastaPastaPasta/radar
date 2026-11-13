import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { decentralizedOnly } from '@/lib/source-mode'
import type { Resolver } from '../types'
import { shortId } from './helpers'

/**
 * Whether a node has executed a state transition with this hash. Platform Explorer's search answers this
 * with its record of the transition, so the node is asked only where Explorer is refused, in Decentralized only mode.
 * A node's answer is not proof-checked, and a transition it does not know reads as `pending`, which offers nothing.
 */
export const sdkTransition: Resolver = {
  id: 'sdk-transition',
  accepts: ['hex64'],
  cost: 'sdk',
  what: msg`State transitions`,
  async resolve(c, { net, signal }) {
    if (!decentralizedOnly()) return []
    const { sdk } = await import('@/data/sdk/client')
    const hash = c.normalized
    const result = await sdk.call(
      net,
      'stateTransitions.waitForStateTransitionResult',
      { hash },
      signal,
    )
    if (result.data.status === 'pending') return []
    return [
      {
        kind: 'transition',
        id: hash,
        title: t`State transition ${shortId(hash)}`,
        subtitle:
          result.data.status === 'executed' ? t`Executed on Platform` : t`Rejected by Platform`,
        href: { to: '/platform/tx/$hash', params: { hash } },
        stamp: stampOf(result),
        rank: 100,
      },
    ]
  },
}
