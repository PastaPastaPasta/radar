import { useDocumentTitle } from '@/features/entity'
import { CoreSection } from './CoreSection'
import { Hero } from './Hero'
import { PlatformSection } from './PlatformSection'

export function HomePage() {
  useDocumentTitle('Radar')
  return (
    <article data-page="/" data-layer="network" className="rx-home">
      <Hero />
      <CoreSection />
      <PlatformSection />
    </article>
  )
}
