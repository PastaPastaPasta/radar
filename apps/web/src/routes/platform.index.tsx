import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '@/app/redirect'
import { PlatformHomePage } from '@/features/platform'

const LEGACY_ANCHORS: Record<string, '/epochs' | '/protocol' | '/validators'> = {
  now: '/epochs',
  next: '/epochs',
  epochs: '/epochs',
  upgrade: '/protocol',
  all: '/validators',
}

export const Route = createFileRoute('/platform/')({
  beforeLoad: ({ location, search }) => {
    const to = LEGACY_ANCHORS[location.hash]
    if (to) throwRedirect({ to }, search)
  },
  component: PlatformHomeRoute,
})

function PlatformHomeRoute() {
  return <PlatformHomePage />
}
