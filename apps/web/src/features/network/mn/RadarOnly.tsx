import { useLingui } from '@lingui/react/macro'
import { Empty, Unavailable } from '@/ui'
import type { MnContext } from './mn-context'

/**
 * What a tab shows where its figures come from Radar's crawl and Radar has none: the mode's unavailable state once
 * (Decentralized only), or a plain note when the crawl simply has no record of the node.
 */
export function RadarOnly({ ctx, what }: { ctx: MnContext; what: string }) {
  const { t } = useLingui()
  if (ctx.off) return <Unavailable title={what} source="radar" />
  return <Empty kind="none-yet" title={t`Radar’s crawl has no record of this masternode.`} />
}
