import { createFileRoute } from '@tanstack/react-router'
import { DecoderPage } from '@/features/tools'

export const Route = createFileRoute('/tools/$decoder')({
  component: DecoderRoute,
})

function DecoderRoute() {
  const { decoder } = Route.useParams()
  return <DecoderPage decoder={decoder} />
}
