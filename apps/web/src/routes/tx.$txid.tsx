import { createFileRoute } from '@tanstack/react-router'
import { TxPage } from '@/features/core'

export const Route = createFileRoute('/tx/$txid')({
  component: TxRoute,
})

function TxRoute() {
  const { txid } = Route.useParams()
  return <TxPage txid={txid} />
}
