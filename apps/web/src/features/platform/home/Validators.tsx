import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { peQueries } from '@/data/pe/queries'
import type { PeQuorum } from '@/data/pe/schemas'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Badge, Card, Empty, Stat, Stats, queryView, stampsOf } from '@/ui'

const QUORUMS_SHOWN = 6

const ONE = { limit: 1 } as const
const quorumKind = (q: PeQuorum): string => q.type.replace(/^llmq_/, '').replace('_', ' / ')

/** PE-06: how many validators there are in each state, the quorums, and who proposed last. */
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
  const quorums = useQuery({ ...peQueries.quorums(net), enabled: active })
  const current = useQuery({ ...peQueries.currentQuorum(net), enabled: active })
  const latest = useQuery({ ...peQueries.latestBlocks(net, 5), enabled: active })

  const all = total.data?.data.total
  const up = live.data?.data.total
  const down = banned.data?.data.total
  const inactive =
    all === undefined || up === undefined || down === undefined
      ? undefined
      : Math.max(0, all - up - down)
  const lastProposer = latest.data?.data.items[0]?.header.validator
  const list = quorums.data?.data ?? []
  const count = (n: number | undefined, failed: boolean) =>
    n === undefined ? (failed ? t`Not available right now` : '…') : formatInt(n)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-validators>
      <Card
        id="validators"
        layer="platform"
        title={t`Validators`}
        subtitle={t`Every evonode Platform Explorer has seen validate.`}
        source={stampsOf(total.data, live.data, banned.data)}
        actions={
          <PageLink to="/masternodes" search={{ view: 'platform' }} className="rx-go">
            {t`All evonodes`}
          </PageLink>
        }
      >
        <Stats>
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
        <p className="mt-3" data-last-proposer>
          {t`Last block proposed by`}{' '}
          {lastProposer ? <Entity kind="evonode" id={lastProposer} /> : '…'}
        </p>
      </Card>
      <Card
        id="quorum-list"
        layer="platform"
        title={t`Quorums`}
        {...queryView(quorums)}
        source={stampsOf(quorums.data, current.data)}
        actions={
          <PageLink to="/quorums" className="rx-go">
            {t`All quorums`}
          </PageLink>
        }
      >
        {list.length === 0 ? (
          <Empty kind="none-yet" title={t`No quorums listed`} />
        ) : (
          <ul className="grid gap-2">
            {[...list]
              .sort((a, b) => Number(b.isCurrent === true) - Number(a.isCurrent === true))
              .slice(0, QUORUMS_SHOWN)
              .map((q) => (
                <li
                  key={q.quorumHash}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <Entity kind="quorum" id={q.quorumHash} />
                  <span className="flex items-center gap-2 text-sm">
                    {q.isCurrent === true || q.quorumHash === current.data?.data.quorumHash ? (
                      <Badge tone="info">{t`Current`}</Badge>
                    ) : null}
                    {quorumKind(q)}
                    {q.numValidMembers == null
                      ? ''
                      : ` · ${t`${formatInt(q.numValidMembers)} valid`}`}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
