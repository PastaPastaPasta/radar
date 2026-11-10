import { createFileRoute } from '@tanstack/react-router'
import { NamesPage } from '@/features/platform'

export const Route = createFileRoute('/names')({
  component: NamesRoute,
})

function NamesRoute() {
  return <NamesPage />
}
