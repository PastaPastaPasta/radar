import { createFileRoute } from '@tanstack/react-router'
import { QrPage } from '@/features/tools'

export const Route = createFileRoute('/tools/qr')({
  component: QrRoute,
})

function QrRoute() {
  return <QrPage />
}
