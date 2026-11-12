import { useDocumentTitle } from '@/features/entity'
import { Activity } from './Activity'
import { CoreZone } from './CoreZone'
import { useHomeWidth } from './home-width'
import { Scope } from './Scope'

export function HomePage() {
  useDocumentTitle('Radar')
  const phone = useHomeWidth() === 'phone'
  return (
    <article data-page="/" data-layer="network" className="rx-home">
      <Scope />
      {phone ? <CoreZone /> : null}
      <div className="dh-container rx-home__activity">
        <Activity />
      </div>
    </article>
  )
}
