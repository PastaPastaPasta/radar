import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Badge, Card, Icon } from '@/ui'
import { checkState } from './mn-info'

const CHECKS: Record<string, MessageDescriptor> = {
  reachable: msg`Answers on its Core port`,
  protocol: msg`Runs a current protocol version`,
  filters: msg`Serves compact block filters`,
  relay: msg`Relays transactions`,
  platform_ban: msg`Not banned on Platform`,
}

export function ReadinessCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { i18n, t } = useLingui()
  const r = d.dkg_readiness
  if (!r) return null
  const overall = checkState(r.overall)
  return (
    <Card
      title={t`Quorum readiness`}
      layer="network"
      source={stamp}
      id="readiness"
      actions={
        <Badge tone={overall === 'pass' ? 'success' : overall === 'fail' ? 'danger' : 'neutral'}>
          {overall === 'pass' ? t`Ready` : overall === 'fail' ? t`Not ready` : r.overall}
        </Badge>
      }
    >
      <ul className="rx-checks" data-readiness>
        {Object.entries(r.checks).map(([id, value]) => {
          const state = checkState(value)
          const label = CHECKS[id]
          return (
            <li key={id} data-check={id} data-state={state}>
              <span className={state === 'pass' ? 'ok' : 'no'}>
                <Icon name={state === 'pass' ? 'check' : 'x'} />
              </span>
              {label ? i18n._(label) : id}
              <span className="rx-dim rx-sm">
                {state === 'pass' ? t`pass` : state === 'fail' ? t`fail` : value}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
