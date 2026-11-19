import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Badge, Card, KeyValue, Stat, Stats, queryView, stampsOf } from '@/ui'
import { signingFirst } from './quorums'

const QUORUMS_SHOWN = 4

const ONE = { limit: 1 } as const
const NONE = {} as const

/** PE-06: how many validators there are in each state, who proposed the latest block, and the quorums. */
export function Validators({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const total = useQuery({ ...peQueries.validators(net, ONE), enabled: active })
  const live = useQuery({
    ...peQueries.validators(net, { ...ONE, isActive: true }),
    enabled: active,
  })
  const banned = useQuery({
    ...peQueries.validators(net, { ...ONE, isBanned: true }),
    enabled: active,
  })
  const quorums = useQuery({
    ...sdkQueries['system.currentQuorumsInfo'](net, NONE),
    enabled: active,
  })
  const latest = useQuery({ ...peQueries.latestBlocks(net, 5), enabled: active })

  const all = total.data?.data.total
  const up = live.data?.data.total
  const down = banned.data?.data.total
  const inactive =
    all === undefined || up === undefined || down === undefined
      ? undefined
      : Math.max(0, all - up - down)
  const head = latest.data?.data.items[0]?.header
  const listed = quorums.data?.data
  const list = useMemo(
    () => signingFirst(listed?.quorums ?? [], head?.quorumHash),
    [listed, head?.quorumHash],
  )
  const count = (n: number | undefined, failed: boolean) =>
    n === undefined ? (failed ? t`Not available right now` : '…') : formatInt(n)
  const waiting = latest.isError ? t`Not available right now` : '…'

  return (
    <div className="rx-cols" data-validators>
      <Card
        id="validators"
        className="rx-netcard"
        layer="platform"
        title={t`Validators`}
        subtitle={t`Every evonode Platform Explorer has seen validate.`}
        source={stampsOf(total.data, live.data, banned.data, latest.data)}
        actions={
          <PageLink to="/masternodes" search={{ view: 'platform' }} className="rx-go">
            {t`All evonodes`}
          </PageLink>
        }
      >
        <Stats data-cols="4">
          <Stat label={t`Total`} value={count(all, total.isError)} layer="platform" />
          <Stat
            label={t({ message: 'Active', context: 'count of active validators' })}
            value={count(up, live.isError)}
            layer="platform"
          />
          <Stat label={t`Banned`} value={count(down, banned.isError)} layer="platform" />
          <Stat
            label={t`Inactive`}
            value={count(inactive, total.isError || live.isError || banned.isError)}
            layer="platform"
          />
        </Stats>
        <div className="rx-netkv" data-last-proposer>
          <KeyValue
            items={[
              {
                label: t`Latest block`,
                value: head ? (
                  <Entity kind="platform-block" id={String(head.height)} copy={false} />
                ) : (
                  waiting
                ),
              },
              {
                label: t`Proposed by`,
                value: head ? <Entity kind="evonode" id={head.validator} /> : waiting,
              },
            ]}
          />
        </div>
      </Card>
      <Card
        id="quorum-list"
        className="rx-netcard"
        layer="platform"
        title={t`Quorums`}
        subtitle={
          listed
            ? t`${formatInt(listed.quorums.length)} quorums at Platform height ${formatInt(listed.height)}. Not proof-checked: the SDK has no proof for this list.`
            : t`Not proof-checked: the SDK has no proof for this list.`
        }
        {...queryView(quorums)}
        source={stampsOf(quorums.data, latest.data)}
        actions={
          <PageLink to="/quorums" className="rx-go">
            {t`All quorums`}
          </PageLink>
        }
      >
        {list.length === 0 ? (
          <p className="rx-board__none" data-board-none>
            {t`The node that answered listed no quorums.`}
          </p>
        ) : (
          <ul className="rx-qlist">
            {list.slice(0, QUORUMS_SHOWN).map(({ quorum: q, signing }) => (
              <li key={q.quorumHash} className="rx-qlist__row" data-signing={signing || undefined}>
                <span className="rx-qlist__who">
                  <Entity kind="quorum" id={q.quorumHash} />
                </span>
                <span className="rx-qlist__meta">
                  {signing ? <Badge tone="info">{t`Signed the latest block`}</Badge> : null}
                  <span className="rx-num">
                    {t`${formatInt(q.memberCount)} members, ${formatInt(q.threshold)} to sign`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
