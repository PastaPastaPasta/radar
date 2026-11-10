import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { KitPage } from '@/ui'

function KitRoute() {
  return (
    <Suspense fallback={null}>
      <KitPage />
    </Suspense>
  )
}

export const Route = createFileRoute('/__kit')({
  component: KitRoute,
})
