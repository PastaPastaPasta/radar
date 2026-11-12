import { useDocumentTitle } from '@/features/entity'
import { Activity } from './Activity'
import { CoreZone } from './CoreZone'
import { Scope } from './Scope'

export function HomePage() {
  useDocumentTitle('Radar')
  return (
    <article data-page="/" data-layer="network" className="rx-home">
      <Scope />
      <div className="dh-container rx-home__activity">
        <Activity />
      </div>
      <CoreZone />
    </article>
  )
}
