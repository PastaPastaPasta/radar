import { Badge, TypeBadge } from '@/ui'
import { coreTxType, txTypeLabel } from './tx-type'

export function TxTypeBadge({ type }: { type: string }) {
  const known = coreTxType(type)
  return known ? <TypeBadge type={known} /> : <Badge>{txTypeLabel(type)}</Badge>
}
