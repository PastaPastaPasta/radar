import { useLingui } from '@lingui/react/macro'
import { useHyphenFit } from '@/data/hyphen/fit'
import { useNetwork } from '@/features/entity'
import { useHyphenFreshness } from '../hy-shared/HyphenGate'
import { useHyphenLagSentence } from '@/ui'

/**
 * Says plainly why a figure only Hyphen can give is missing: its index trails the chain, and by how much.
 * Quiet while Hyphen is current, and quiet until the freshness probe has measured a lag.
 */
export function HyphenOnlyNote({ what }: { what: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  useHyphenFit(net)
  const lagged = useHyphenLagSentence(net, useHyphenFreshness().lag)
  if (lagged === undefined) return null
  return (
    <p className="rx-note" role="note" data-hyphen-lag>
      {lagged} {t`${what} come only from Hyphen. Everything else on this page is from DAPI.`}
    </p>
  )
}
