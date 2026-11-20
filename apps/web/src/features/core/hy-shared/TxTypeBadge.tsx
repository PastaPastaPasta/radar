import { useLingui } from '@lingui/react/macro'
import { useNetwork } from '@/features/entity'
import { looksLikeCoinJoinMix, type TxRowFacts } from '@/lib/coinjoin'
import { Badge, TypeBadge } from '@/ui'
import { coreTxType, txTypeLabel } from './tx-type'

/** An index's type name as a badge; given the row's figures, a mix reads CoinJoin rather than Payment. */
export function TxTypeBadge({
  type,
  outputCount,
  row,
}: {
  type: string
  outputCount?: number
  row?: TxRowFacts
}) {
  const { t } = useLingui()
  const net = useNetwork()
  if (row && looksLikeCoinJoinMix(row, net)) {
    const why = t`CoinJoin, inferred from the transaction’s total and zero fee; its page checks each output`
    return (
      <span title={why} data-inferred="">
        <TypeBadge type="coinjoin" />
        <span className="dh-sr">{why}</span>
      </span>
    )
  }
  const known = coreTxType(type, outputCount)
  if (known) return <TypeBadge type={known} />
  return <Badge>{type === 'data' ? t`Carries data` : txTypeLabel(type)}</Badge>
}
