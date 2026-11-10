import { RoutePlaceholder } from '@/features/entity'

export function TxPage({ txid }: { txid: string }) {
  return <RoutePlaceholder path="/tx/$txid" params={{ txid }} />
}
