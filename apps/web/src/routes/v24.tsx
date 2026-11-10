import { createFileRoute } from '@tanstack/react-router'
import { V24Page } from '@/features/network'

export const Route = createFileRoute('/v24')({
  component: V24Route,
})

function V24Route() {
  return <V24Page />
}
