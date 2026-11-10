import { createFileRoute } from '@tanstack/react-router'
import { AboutPage } from '@/features/you'

export const Route = createFileRoute('/about')({
  component: AboutRoute,
})

function AboutRoute() {
  return <AboutPage />
}
