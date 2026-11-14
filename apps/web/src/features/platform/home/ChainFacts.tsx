import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { sdkBatchers, sdkQueries } from '@/data/sdk/queries'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { wellKnownContracts } from '@/lib/well-known'
import { Card, Empty, Time, queryView, stampsOf } from '@/ui'
import { homeQueries } from './queries'

const NONE = {} as const
const POLLS_SHOWN = 5

/** NX-04, first part: how many quorums of each size are active. */
export function QuorumsCard({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery({ ...sdkQueries['system.currentQuorumsInfo'](net, NONE), enabled: active })
  const sizes = useMemo(() => {
    const bySize = new Map<
      string,
      { members: number; threshold: number; type: string; count: number }
    >()
    for (const q of query.data?.data.quorums ?? []) {
      const key = `${q.quorumType}:${q.memberCount}:${q.threshold}`
      const group = bySize.get(key)
      if (group) group.count += 1
      else {
        bySize.set(key, {
          members: q.memberCount,
          threshold: q.threshold,
          type: q.quorumType,
          count: 1,
        })
      }
    }
    return [...bySize.values()].sort((a, b) => b.members - a.members || (a.type < b.type ? -1 : 1))
  }, [query.data])
  return (
    <Card
      id="quorums"
      layer="platform"
      title={t`Quorums by size`}
      subtitle={t`The quorums Platform signs with now. Not proof-checked: the SDK has no proof for this list.`}
      {...queryView(query)}
      source={stampsOf(query.data)}
      actions={
        <PageLink to="/quorums" className="rx-go">
          {t`All quorums`}
        </PageLink>
      }
    >
      {sizes.length === 0 ? (
        <Empty kind="none-yet" title={t`No active quorums`} />
      ) : (
        <ul className="grid gap-2" data-quorum-sizes>
          {sizes.map((s) => (
            <li
              key={`${s.type}-${s.members}-${s.threshold}`}
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <span>{t`${formatInt(s.members)} members, ${formatInt(s.threshold)} to sign`}</span>
              <b className="rx-num">{formatInt(s.count)}</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** NX-04, second part: vote polls that end within 30 days. */
export function PollsCard({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery({ ...homeQueries.polls(net), enabled: active })
  const polls = query.data?.data.polls ?? []
  return (
    <Card
      id="polls"
      layer="platform"
      title={t`Polls ending soon`}
      subtitle={t`Vote polls that end in the next 30 days.`}
      {...queryView(query)}
      source={stampsOf(query.data)}
      actions={
        <PageLink to="/polls" className="rx-go">
          {t`All polls`}
        </PageLink>
      }
    >
      {polls.length === 0 ? (
        <Empty kind="none-yet" title={t`No vote polls end in the next 30 days`} />
      ) : (
        <>
          <p className="mb-2" data-poll-count>
            {plural(polls.length, {
              one: '# poll ends in the next 30 days.',
              other: '# polls end in the next 30 days.',
            })}
            {query.data?.data.truncated ? ` ${t`Later ones may be missing.`}` : null}
          </p>
          <ul className="grid gap-2">
            {polls.slice(0, POLLS_SHOWN).map(({ endsAt, poll }) => {
              const last = poll.indexValues.at(-1)
              const label = typeof last === 'string' ? last : JSON.stringify(last)
              return (
                <li
                  key={`${endsAt}-${poll.contractId}-${poll.indexValues.join('/')}`}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  {poll.documentTypeName === 'domain' ? (
                    <Entity kind="contest" id={label} label={`${label}.dash`} />
                  ) : (
                    <Entity kind="contract" id={poll.contractId} />
                  )}
                  <Time ms={endsAt} mode="relative" />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

/** NX-04, third part: the system contracts, named. Versions come from the shared batched, proof-checked contract read. */
export function ContractsCard({ active }: { active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const contracts = wellKnownContracts(net)
  const metas = useQueries({
    queries: contracts.map((c) => ({
      ...sdkBatchers.contractMeta.queryOptions(net, c.id),
      enabled: active,
    })),
  })
  return (
    <Card
      id="contracts"
      layer="platform"
      title={t`Well-known contracts`}
      subtitle={t`The system contracts every network ships with.`}
      source={stampsOf(...metas.map((m) => m.data))}
      actions={
        <PageLink to="/contracts" className="rx-go">
          {t`All contracts`}
        </PageLink>
      }
    >
      <ul className="grid gap-3">
        {contracts.map((c, i) => {
          const version = metas[i]?.data?.data?.version
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2"
              data-contract={c.id}
            >
              <span className="grid gap-0.5">
                <Entity kind="contract" id={c.id} label={c.name} />
                <span className="text-sm text-[var(--dh-ink-2,inherit)]">{c.description}</span>
              </span>
              <span className="rx-num text-sm">
                {version === undefined ? '' : t`version ${formatInt(version)}`}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
