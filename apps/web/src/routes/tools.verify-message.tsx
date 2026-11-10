import { createFileRoute } from '@tanstack/react-router'
import { VerifyMessagePage } from '@/features/tools'

export const Route = createFileRoute('/tools/verify-message')({
  component: VerifyMessagePage,
})
