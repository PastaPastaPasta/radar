import { useDocumentTitle } from '@/features/entity'
import { Activity } from './Activity'
import { CoreZone } from './CoreZone'
import { Scope } from './Scope'

export function HomePage() {
  useDocumentTitle('Radar')
  return (
    <article data-page="/" data-layer="network" className="rx-home">
      <Scope />
      <CoreZone />
      <div className="dh-container rx-home__activity" style={{ paddingTop: 40 }}>
        <Activity />
      </div>
    </article>
  )
}
