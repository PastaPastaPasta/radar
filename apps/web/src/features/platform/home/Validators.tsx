import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { peQueries } from '@/data/pe/queries'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, KeyValue, Stat, Stats, queryView, stampsOf } from '@/ui'

const ONE = { limit: 1 } as const

/**
 * PE-06: how many validators there are in each state, and the newest block Platform Explorer has indexed: who
 * proposed it and which quorum signed it. The quorums themselves are counted and sized under "On the chain", from DAPI.
 */
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
  const latest = useQuery({ ...peQueries.latestBlocks(net, 5), enabled: active })

  const all = total.data?.data.total
  const up = live.data?.data.total
  const down = banned.data?.data.total
  const inactive =
    all === undefined || up === undefined || down === undefined
      ? undefined
      : Math.max(0, all - up - down)
  const head = latest.data?.data.items[0]?.header
  const unavailable = t`Not available right now`
  /** A count that did not come is a dash with its reason in reach, so four of them never wrap a long sentence. */
  const count = (n: number | undefined, failed: boolean) =>
    n !== undefined ? (
      formatInt(n)
    ) : failed ? (
      <abbr title={unavailable} aria-label={unavailable} data-unavailable-figure>
        —
      </abbr>
    ) : (
      '…'
    )

  return (
    <div className="rx-cols" data-validators>
      <Card
        id="validators"
        className="rx-netcard"
        layer="platform"
        title={t`Validators`}
        subtitle={t`Every evonode Platform Explorer has seen validate.`}
        {...queryView(total)}
        source={stampsOf(total.data, live.data, banned.data)}
        actions={
          <PageLink to="/masternodes" search={{ view: 'platform' }} className="rx-go">
            {t`All evonodes`}
          </PageLink>
        }
      >
        <Stats data-counts>
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
      </Card>
      <Card
        id="latest-block"
        className="rx-netcard"
        layer="platform"
        title={t`Newest indexed block`}
        subtitle={t`The newest block in Platform Explorer’s index. The proved tip can be ahead of it.`}
        {...queryView(latest)}
        source={stampsOf(latest.data)}
        actions={
          <PageLink to="/quorums" className="rx-go">
            {t`All quorums`}
          </PageLink>
        }
      >
        {head ? (
          <div data-last-proposer>
            <KeyValue
              items={[
                {
                  label: t`Block`,
                  value: <Entity kind="platform-block" id={String(head.height)} copy={false} />,
                },
                {
                  label: t`Proposed by`,
                  value: <Entity kind="evonode" id={head.validator} />,
                },
                {
                  label: t`Signed by quorum`,
                  value: head.quorumHash ? (
                    <span data-signing-quorum>
                      <Entity kind="quorum" id={head.quorumHash.toLowerCase()} />
                    </span>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <p className="rx-board__none" data-board-none>
            {t`Platform Explorer has indexed no block yet.`}
          </p>
        )}
      </Card>
    </div>
  )
}
