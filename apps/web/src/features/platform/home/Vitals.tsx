import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { platformTipQuery, sdkQueries } from '@/data/sdk/queries'
import { PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, EpochClock, Stat, Stats } from '@/ui'
import { epochLengthMs } from '@/lib/epoch-length'
import { stampsOf } from './state'
import { useAfterIdle } from './use-in-view'

const NONE = {} as const

/** The five vital signs of NX-01: four proof-checked reads and the unproved quorum list, five SDK calls in all. */
export function Vitals() {
  const { t } = useLingui()
  const net = useNetwork()
  const ready = useAfterIdle()
  const tip = useQuery({ ...platformTipQuery(net), enabled: ready })
  const credits = useQuery({ ...sdkQueries['system.totalCredits'](net, NONE), enabled: ready })
  const upgrade = useQuery({
    ...sdkQueries['protocol.versionUpgradeState'](net, NONE),
    enabled: ready,
  })
  const quorums = useQuery({
    ...sdkQueries['system.currentQuorumsInfo'](net, NONE),
    enabled: ready,
  })

  const epoch = tip.data?.data.epoch
  const height = tip.data?.data.height
  const length = epochLengthMs(net)
  const missing = (failed: boolean) => (failed ? t`Not available right now` : '…')
  const next = upgrade.data?.data.nextProtocolVersion
  const votes = upgrade.data?.data.voteCount
  const quorumCount = quorums.data?.data.quorums.length

  return (
    <Card
      id="vitals"
      layer="platform"
      title={t`Vital signs`}
      subtitle={t`Read from the Platform nodes and checked against their proofs.`}
      source={stampsOf(tip.data, credits.data, upgrade.data, quorums.data)}
    >
      <div className="grid grid-cols-1 gap-4" data-vitals>
        {epoch ? (
          <EpochClock
            size="md"
            index={epoch.number}
            startedAt={epoch.startedAt}
            blocksSoFar={
              height === undefined ? undefined : Math.max(0, height - epoch.firstBlockHeight + 1)
            }
            expectedEndAt={length === undefined ? undefined : epoch.startedAt + length}
            estimated
          />
        ) : null}
        <Stats>
          <Stat
            label={t`Platform height`}
            value={height === undefined ? missing(tip.isError) : formatInt(height)}
            loading={height === undefined && !tip.isError}
            source={tip.data ? stampOf(tip.data) : undefined}
            layer="platform"
          />
          {epoch ? null : (
            <Stat
              label={t`Epoch`}
              value={missing(tip.isError)}
              loading={!tip.isError}
              layer="platform"
            />
          )}
          <Stat
            label={t`Total credits`}
            value={
              credits.data?.data == null ? (
                missing(credits.isError)
              ) : (
                <Amount value={credits.data.data} kind="credits" fiat compact />
              )
            }
            loading={!credits.data && !credits.isError}
            source={credits.data ? stampOf(credits.data) : undefined}
            layer="platform"
          />
          <Stat
            label={t`Protocol version`}
            value={
              upgrade.data
                ? `v${upgrade.data.data.currentProtocolVersion}`
                : missing(upgrade.isError)
            }
            note={
              next != null
                ? votes != null
                  ? plural(Number(votes), {
                      one: `Upgrade to v${next}: # vote so far`,
                      other: `Upgrade to v${next}: # votes so far`,
                    })
                  : t`Upgrade to v${next} is being voted on`
                : upgrade.data
                  ? t`No upgrade pending`
                  : undefined
            }
            loading={!upgrade.data && !upgrade.isError}
            source={upgrade.data ? stampOf(upgrade.data) : undefined}
            layer="platform"
          />
          <Stat
            label={t`Active quorums`}
            value={quorumCount === undefined ? missing(quorums.isError) : formatInt(quorumCount)}
            note={quorumCount === undefined ? undefined : t`Not proof-checked`}
            loading={!quorums.data && !quorums.isError}
            source={quorums.data ? stampOf(quorums.data) : undefined}
            layer="platform"
          />
        </Stats>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <PageLink to="/platform/blocks" className="rx-go">
            {t`Blocks`}
          </PageLink>
          <PageLink to="/epochs" className="rx-go">
            {t`Epochs`}
          </PageLink>
          <PageLink to="/credits" className="rx-go">
            {t`Credits`}
          </PageLink>
          <PageLink to="/protocol" className="rx-go">
            {t`Protocol`}
          </PageLink>
          <PageLink to="/quorums" className="rx-go">
            {t`Quorums`}
          </PageLink>
        </p>
      </div>
    </Card>
  )
}
