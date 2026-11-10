import { useDocumentTitle } from '@/features/entity'
import { Activity } from './Activity'
import { CoreZone } from './CoreZone'
import { Scope } from './Scope'

export function HomePage() {
  useDocumentTitle('Radar')
  return (
    <article data-page="/" data-layer="network">
      <Scope />
      <div className="dh-container" style={{ paddingTop: 40 }}>
        <Activity />
      </div>
      <CoreZone />
    </article>
  )
}
