import { useLingui } from '@lingui/react/macro'
import { Entity, useNetwork, usePageClaim } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import {
  Card,
  EpochClock,
  KeyValue,
  Time,
  epochProgress,
  queryView,
  stampsOf,
  useAfterIdle,
  useNow,
} from '@/ui'
import { epochLengthMs } from '@/lib/epoch-length'
import { useCurrentEpoch } from './current-epoch'

/** The multiplier on every fee this epoch, as the chain sets it: 1000 permille is 1×. */
export function formatMultiplier(permille: number): string {
  return `${(permille / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })}×`
}

/** RA-60, NX-50: where the current epoch stands, from one proof-checked read. */
export function CurrentEpoch() {
  const { t } = useLingui()
  const net = useNetwork()
  const ready = useAfterIdle()
  const tip = useCurrentEpoch(net, ready)
  const epoch = tip.data?.data
  const height = tip.data?.height
  const length = epochLengthMs(net)
  const blocksSoFar =
    epoch === undefined || height === undefined
      ? undefined
      : Math.max(0, height - epoch.firstBlockHeight + 1)
  const endsAt =
    epoch === undefined || length === undefined ? undefined : epoch.firstBlockTimeMs + length
  const now = useNow()
  const ratio = epoch ? epochProgress(epoch.firstBlockTimeMs, endsAt, now) : undefined
  const number = epoch ? formatInt(epoch.index) : ''
  usePageClaim(
    epoch === undefined || ratio === undefined
      ? undefined
      : ratio >= 1
        ? t`Epoch ${number} is running past its expected end`
        : // Rounding must not call an epoch that has not reached its expected end complete.
          t`Epoch ${number} is ${formatPercent(Math.min(ratio, 0.99), 0)} through`,
  )
  return (
    <Card
      level="section"
      id="current-epoch"
      layer="network"
      title={t`Current epoch`}
      source={stampsOf(tip.data)}
      {...queryView(tip)}
    >
      {epoch ? (
        <div className="grid grid-cols-1 gap-4">
          <EpochClock
            size="lg"
            bare
            index={epoch.index}
            startedAt={epoch.firstBlockTimeMs}
            blocksSoFar={blocksSoFar}
            expectedEndAt={endsAt}
            estimated
          />
          <KeyValue
            columns={2}
            items={[
              {
                label: t`Started`,
                value: <Time ms={epoch.firstBlockTimeMs} mode="absolute" />,
              },
              {
                label: t`Estimated end`,
                value: endsAt === undefined ? t`Not known` : <Time ms={endsAt} mode="absolute" />,
                hint: endsAt === undefined ? undefined : t`An estimate from the epoch’s length`,
              },
              {
                label: t`First block`,
                value: <Entity kind="platform-block" id={String(epoch.firstBlockHeight)} />,
              },
              {
                label: t`Blocks so far`,
                value: blocksSoFar === undefined ? '—' : formatInt(blocksSoFar),
              },
              {
                label: t`Fee multiplier`,
                value:
                  epoch.feeMultiplierPermille === undefined
                    ? '—'
                    : formatMultiplier(epoch.feeMultiplierPermille),
              },
              {
                label: t`Protocol version`,
                value: epoch.protocolVersion === undefined ? '—' : `v${epoch.protocolVersion}`,
              },
            ]}
          />
        </div>
      ) : null}
    </Card>
  )
}
