import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { PageLink, Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Badge, Card, Hash, KeyValue, Time } from '@/ui'
import type { MnContext } from './mn-context'
import { usePlatformLive, stampsOf } from './mn-data'
import { protxToBase58 } from './mn-info'
import { blocksIn, payoutIn, rankIn } from './platform-math'

/** One evonode's Platform record for an epoch picked from the recent ones, and its id in both spellings. */
export function EpochCard({ ctx, epoch }: { ctx: MnContext; epoch: number | undefined }) {
  const { t } = useLingui()
  const { current, thisEpoch, finalized, vote } = usePlatformLive(ctx.net, ctx.protx)
  const now = current.data?.data
  const infos = finalized.data?.data ?? []
  const selected = epoch ?? now?.index
  const info = infos.find((i) => i.index === selected)
  const isCurrent = now !== undefined && selected === now.index
  const choices = now ? [now.index, ...[...infos].map((i) => i.index).sort((a, b) => b - a)] : []
  const protx = ctx.protx.toLowerCase()
  const radarNow = ctx.d?.platform_rewards?.current

  const blocks = isCurrent
    ? (thisEpoch.data?.data.get(protx) ?? (thisEpoch.data ? 0n : undefined))
    : info
      ? blocksIn(info, protx)
      : undefined
  const total = isCurrent ? radarNow?.blocks_total : info?.totalBlocks
  const rank = isCurrent
    ? radarNow?.rank != null && radarNow.proposers != null
      ? { rank: radarNow.rank, of: radarNow.proposers }
      : null
    : info
      ? rankIn(info, protx)
      : null
  const share = blocks !== undefined && total ? Number(blocks) / total : null
  const voted = vote.data?.data.get(protx)
  const stamps = stampsOf(current.data, thisEpoch.data, finalized.data, vote.data)

  const ready = now !== undefined
  return (
    <Card
      title={t`Epoch record`}
      layer="platform"
      source={stamps}
      id="epoch-record"
      subtitle={t`Blocks this evonode proposed in one epoch, from Platform`}
      state={current.isPending ? 'loading' : current.isError && !now ? 'error' : 'ready'}
      error={current.error}
      onRetry={() => void current.refetch()}
    >
      <div className="grid gap-4">
        {ready ? (
          <nav aria-label={t`Epoch`} data-epoch-select>
            <ul className="flex flex-wrap gap-2">
              {choices.map((e) => (
                <li key={e}>
                  <PageLink
                    to={`/mn/${ctx.protx}`}
                    search={{ tab: 'platform', epoch: e === now.index ? undefined : String(e) }}
                    aria-current={e === selected ? 'true' : undefined}
                    replace
                    className={
                      e === selected
                        ? 'dh-btn dh-btn--sm font-bold underline underline-offset-4'
                        : 'dh-btn dh-btn--sm'
                    }
                  >
                    {formatInt(e)}
                    {e === now.index ? ` · ${t`now`}` : ''}
                  </PageLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {ready && selected !== undefined && !isCurrent && !info ? (
          <p className="rx-dim" data-epoch-missing>
            {t`Epoch ${formatInt(selected)} is outside the ${plural(infos.length, { one: '# recent epoch', other: '# recent epochs' })} read here, or not final yet.`}
          </p>
        ) : null}
        {ready && selected !== undefined && (isCurrent || info) ? (
          <KeyValue
            columns={2}
            items={[
              {
                label: t`Epoch`,
                value: <Entity kind="epoch" id={String(selected)} label={formatInt(selected)} />,
                hint: isCurrent ? (
                  <>
                    {t`started`} <Time ms={now.firstBlockTimeMs} mode="absolute" />
                  </>
                ) : info ? (
                  <>
                    {t`started`} <Time ms={info.firstBlockTimeMs} mode="absolute" />
                  </>
                ) : undefined,
              },
              {
                label: t`Blocks proposed`,
                value: blocks === undefined ? '…' : formatInt(Number(blocks)),
                hint: isCurrent
                  ? t`so far this epoch`
                  : total
                    ? t`of ${formatInt(total)}`
                    : undefined,
              },
              {
                label: t`Rank`,
                value: rank ? t`${formatInt(rank.rank)} of ${formatInt(rank.of)}` : '—',
                hint: isCurrent
                  ? t`from Radar’s count`
                  : t`among the evonodes that proposed blocks`,
              },
              {
                label: t`Share of blocks`,
                value: share === null ? '—' : formatPercent(share, 2),
              },
              ...(info
                ? [
                    {
                      label: t`Paid`,
                      value: <Amount value={payoutIn(info, protx)} kind="credits" />,
                      hint: t`worked out from the epoch’s proven fees`,
                    },
                  ]
                : []),
              {
                label: t`Upgrade vote`,
                value: isCurrent ? (
                  voted === undefined ? (
                    <Badge tone="neutral">{t`No vote seen`}</Badge>
                  ) : voted > now.protocolVersion ? (
                    <Badge tone="success">{t`Votes for protocol ${voted}`}</Badge>
                  ) : (
                    <Badge tone="neutral">{t`On protocol ${voted}`}</Badge>
                  )
                ) : info ? (
                  <Badge tone="neutral">{t`Epoch ran protocol ${info.protocolVersion}`}</Badge>
                ) : (
                  '—'
                ),
                hint: isCurrent
                  ? t`Platform keeps each masternode’s latest vote`
                  : t`votes are not kept per epoch`,
              },
            ]}
          />
        ) : null}
        <KeyValue
          items={[
            { label: t`ProTx (hex)`, value: <Hash value={protx} display="full" /> },
            {
              label: t`ProTx (base58, its identity)`,
              value: <Hash value={protxToBase58(protx)} display="full" />,
            },
          ]}
        />
      </div>
    </Card>
  )
}
