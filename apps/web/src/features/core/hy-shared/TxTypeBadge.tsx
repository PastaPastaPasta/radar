import { useLingui } from '@lingui/react/macro'
import { Badge, TypeBadge } from '@/ui'
import { coreTxType, txTypeLabel } from './tx-type'

export function TxTypeBadge({ type, outputCount }: { type: string; outputCount?: number }) {
  const { t } = useLingui()
  const known = coreTxType(type, outputCount)
  if (known) return <TypeBadge type={known} />
  return <Badge>{type === 'data' ? t`Carries data` : txTypeLabel(type)}</Badge>
}
