import { createFileRoute } from '@tanstack/react-router'
import { SdkReferencePage } from '@/features/tools'

export const Route = createFileRoute('/sdk-reference')({
  component: SdkReferenceRoute,
})

function SdkReferenceRoute() {
  return <SdkReferencePage />
}
