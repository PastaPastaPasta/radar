import { useLingui } from '@lingui/react/macro'
import { useSourceHealth } from '@/data/health'
import { useHyphenFit } from '@/data/hyphen/fit'
import { networkName, useNetwork } from '@/features/entity'

/**
 * Says plainly why a figure only Hyphen can give is missing: its index trails the chain, and by how much.
 * Quiet while Hyphen is current, and quiet until the freshness probe has measured a lag.
 */
export function HyphenOnlyNote({ what }: { what: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  useHyphenFit(net)
  const health = useSourceHealth('hyphen')
  if (health.state !== 'stale' || !health.lag) return null
  const name = networkName(net)
  return (
    <p className="rx-note" role="note" data-hyphen-lag>
      {t`${what} come only from Hyphen, whose ${name} index is behind the chain: ${health.lag.detail}. Everything else on this page is from DAPI.`}
    </p>
  )
}
