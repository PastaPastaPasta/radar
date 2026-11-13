import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { HyValidatorDetail } from '@/data/hyphen/schemas'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { Entity, PageLink } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Empty, Hash, Time, useHyphenLagSentence } from '@/ui'
import { useIndexHealth } from '@/data/index-health'
import type { MnContext } from './mn-context'
import { useSpecialTxs } from './mn-data'
import { RadarOnly } from './RadarOnly'
import { UptimeCard } from './UptimeCard'

type Change = RadarMasternodeDetail['changes'][number]
type Version = RadarMasternodeDetail['versions'][number]
type Special = HyValidatorDetail['history'][number]

export function HistoryTab({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { d, radar } = ctx
  if (ctx.off) {
    return (
      <RadarOnly
        ctx={ctx}
        what={t`History needs Radar’s crawl and Hyphen’s index of special transactions`}
      />
    )
  }
  return (
    <div className="grid gap-5">
      <HistoryNotice ctx={ctx} />
      {d && radar ? (
        <>
          <UptimeCard daily={d.uptime_daily} stamp={radar} />
          <div className="rx-split">
            <VersionsCard versions={d.versions} stamp={radar} />
            <ChangesCard changes={d.changes} stamp={radar} />
          </div>
        </>
      ) : (
        <RadarOnly ctx={ctx} what={t`Uptime and versions need Radar’s crawl`} />
      )}
      <SpecialTxCard ctx={ctx} />
    </div>
  )
}

/** The page's one notice when the index the special transactions come from is behind the chain. */
function HistoryNotice({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const index = useIndexHealth(ctx.net)
  const sentence = useHyphenLagSentence(ctx.net, index.state === 'stale' ? index.lag : undefined)
  if (sentence === undefined) return null
  return (
    <p role="status" data-stale-index className="rx-note rounded border p-3">
      {sentence}{' '}
      {t`Special transactions after that block are not in this list. Everything else on this page is current.`}{' '}
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}

function VersionsCard({ versions, stamp }: { versions: Version[]; stamp: SourceStamp }) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<Version>[]>(
    () => [
      {
        id: 'seen',
        header: t`First seen`,
        cell: ({ row }) => <Time ms={row.original.ts} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'agent',
        header: t`Version`,
        cell: ({ row }) => <code>{row.original.user_agent}</code>,
        meta: { phone: 'title' },
      },
      {
        id: 'protocol',
        header: t`Protocol`,
        cell: ({ row }) => String(row.original.protocol),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Version history`}
      layer="network"
      source={stamp}
      id="versions"
      subtitle={t`What the node announced, newest first`}
      padding="flush"
    >
      <DataTable
        caption={t`Versions this masternode has announced`}
        columns={columns}
        rows={versions}
        getRowId={(v) => `${v.ts}-${v.user_agent}`}
        state="ready"
        empty={<Empty kind="none-yet" title={t`No versions recorded yet.`} />}
      />
    </Card>
  )
}

const CHANGE_LABEL_ORDER = [
  'registered',
  'removed',
  'returned',
  'service',
  'platform_p2p',
  'platform_https',
  'platform_node_id',
  'payout_address',
  'operator_payout_address',
  'owner_address',
  'voting_address',
  'pubkey_operator',
  'operator_reward',
  'pose',
] as const

function ChangesCard({ changes, stamp }: { changes: Change[]; stamp: SourceStamp }) {
  const { t } = useLingui()
  const label = (field: string): string => {
    switch (field) {
      case 'registered':
        return t`Registered`
      case 'removed':
        return t`Left the list`
      case 'returned':
        return t`Back in the list`
      case 'service':
        return t`Core P2P address`
      case 'platform_p2p':
        return t`Platform P2P address`
      case 'platform_https':
        return t`Platform HTTPS address`
      case 'platform_node_id':
        return t`Platform node ID`
      case 'payout_address':
        return t`Payout address`
      case 'operator_payout_address':
        return t`Operator payout address`
      case 'owner_address':
        return t`Owner address`
      case 'voting_address':
        return t`Voting address`
      case 'pubkey_operator':
        return t`Operator key`
      case 'operator_reward':
        return t`Operator reward`
      case 'pose':
        return t`PoSe status`
      default:
        return field
    }
  }
  const show = (v: unknown): string =>
    v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v)
  const text = (c: Change): string => {
    const field = c.field ?? ''
    const known = (CHANGE_LABEL_ORDER as readonly string[]).includes(field)
    const name = known ? label(field) : field
    if (field === 'registered' || field === 'returned') {
      return c.new ? t`${name} at ${show(c.new)}` : name
    }
    if (field === 'removed') return c.old ? t`${name} (was at ${show(c.old)})` : name
    if (field === 'operator_reward') {
      return t`${name}: ${show(c.old)}% → ${show(c.new)}%`
    }
    return t`${name}: ${show(c.old)} → ${show(c.new)}`
  }
  const columns = useMemo<ColumnDef<Change>[]>(
    () => [
      {
        id: 'when',
        header: t`When`,
        cell: ({ row }) =>
          row.original.ts === undefined ? '—' : <Time ms={row.original.ts} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) =>
          row.original.height === undefined ? (
            '—'
          ) : (
            <Entity
              kind="block"
              id={String(row.original.height)}
              label={formatInt(row.original.height)}
            />
          ),
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'change',
        header: t`Change`,
        cell: ({ row }) => text(row.original),
        meta: { phone: 'title' },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- text only closes over t
    [t],
  )
  return (
    <Card
      title={t`Registration changes`}
      layer="network"
      source={stamp}
      id="changes"
      subtitle={t`Addresses, keys and PoSe status, as Radar recorded them`}
      padding="flush"
    >
      <DataTable
        caption={t`Registration changes of this masternode`}
        columns={columns}
        rows={changes}
        getRowId={(c) => `${c.ts}-${c.field}-${c.height}`}
        state="ready"
        empty={<Empty kind="none-yet" title={t`No changes since Radar started recording them.`} />}
      />
    </Card>
  )
}

function SpecialTxCard({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const { index, query, enabled } = useSpecialTxs(ctx.net, ctx.protx)
  const stale = index.state === 'stale'
  const history = useMemo<Special[]>(
    () => [...(query.data?.data?.history ?? [])].sort((a, b) => b.blockHeight - a.blockHeight),
    [query.data],
  )
  const columns = useMemo<ColumnDef<Special>[]>(
    () => [
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <Badge tone="info">{row.original.txType}</Badge>,
        meta: { phone: 'title' },
      },
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity
            kind="block"
            id={String(row.original.blockHeight)}
            label={formatInt(row.original.blockHeight)}
          />
        ),
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txHash} />,
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  const registration = ctx.d ? (
    <p className="rx-sm" data-registration-tx>
      {t`Registered at block`}{' '}
      <Entity
        kind="block"
        id={String(ctx.d.registered_height)}
        label={formatInt(ctx.d.registered_height)}
      />
      {' · '}
      {t`ProRegTx`} <Entity kind="tx" id={ctx.protx} />
    </p>
  ) : null
  return (
    <Card
      title={t`Special transactions`}
      layer="core"
      source={query.data}
      id="special-txs"
      subtitle={t`Every ProRegTx and ProUp… transaction that changed this masternode`}
      padding={enabled && !stale && history.length > 0 ? 'flush' : 'normal'}
      state={
        enabled && query.isPending
          ? 'loading'
          : enabled && query.isError && !query.data
            ? 'error'
            : 'ready'
      }
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {stale ? (
        <>
          <Empty
            kind="none-yet"
            title={t`Hyphen’s index is behind the chain, so this list is not read.`}
            body={t`The registration transaction is the ProTx hash itself.`}
          />
          {registration}
        </>
      ) : !enabled ? (
        <p className="rx-dim">{t`Checking whether Hyphen’s index is current…`}</p>
      ) : history.length === 0 ? (
        <Empty
          kind="none-yet"
          title={t`Hyphen has no special transactions for this ProTx.`}
          body={<Hash value={ctx.protx} display="short" />}
        />
      ) : (
        <>
          <DataTable
            caption={t`Special transactions of this masternode`}
            columns={columns}
            rows={history}
            getRowId={(h) => `${h.txHash}-${h.txType}`}
            state="ready"
          />
          <p className="rx-card__foot rx-dim rx-sm">
            {plural(history.length, {
              one: '# special transaction in Hyphen’s record',
              other: '# special transactions in Hyphen’s record',
            })}
          </p>
        </>
      )}
    </Card>
  )
}
