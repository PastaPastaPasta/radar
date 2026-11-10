import { lazy, Suspense } from 'react'

const KitContent =
  import.meta.env.DEV ||
  import.meta.env.VITE_DATA_MODE === 'fixtures' ||
  import.meta.env.VITE_RADAR_KIT === '1'
    ? lazy(() => import('./KitContent'))
    : null

export default function KitPage() {
  if (!KitContent) {
    return (
      <div className="dh-container py-16">
        <h1 className="dh-h1">Not found</h1>
        <p>This page is only part of development and preview builds.</p>
      </div>
    )
  }
  return (
    <Suspense fallback={null}>
      <KitContent />
    </Suspense>
  )
}
