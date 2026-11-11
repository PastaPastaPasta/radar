import { useLingui } from '@lingui/react/macro'
import type { NetworkId } from '@/lib/network'
import { networkName } from './network-name'

/** The one sentence every page uses to say Hyphen's index trails the chain; undefined while `lag` is. */
export function useHyphenLagSentence(net: NetworkId, lag: string | undefined): string | undefined {
  const { t } = useLingui()
  if (lag === undefined) return undefined
  const name = networkName(net)
  return t`Hyphen’s ${name} index is behind the chain: ${lag}.`
}
