import { RoutePlaceholder } from '@/features/entity'

export function DecoderPage({ decoder }: { decoder: string }) {
  return <RoutePlaceholder path="/tools/$decoder" params={{ decoder }} />
}
