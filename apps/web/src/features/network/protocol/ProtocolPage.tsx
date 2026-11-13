import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import type { Sourced } from '@/data/envelope'
import { radarQueries } from '@/data/radar/queries'
import type { RadarPlatform } from '@/data/radar/schemas'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageFrame, useNetwork } from '@/features/entity'
import { queryView, sortRows, stampsOf, useAfterIdle } from '@/features/network/epochs/state'
import { formatInt, formatPercent } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, DataTable, Empty, KeyValue, Meter, Stat, Stats, Unavailable } from '@/ui'
import { ACTIVATION_SHARE, protocolQueries, thresholdOf, type VoteRow, type Votes } from './queries'

type VotesQuery = UseQueryResult<Sourced<Votes>>

const NONE = {} as const
const PAGE = 50

/** RA-61, NX-56: the Platform protocol version and the evonodes' votes for the next one. */
export function ProtocolPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const ready = useAfterIdle()
  const state = useQuery({
    ...sdkQueries['protocol.versionUpgradeState'](net, NONE),
    enabled: ready,
  })
  const votes = useQuery({ ...protocolQueries.votes(net), enabled: ready })
  const radar = useQuery({ ...radarQueries.platform(net), enabled: !off && !devnet })

  const next = state.data?.data.nextProtocolVersion ?? null
  const current = state.data?.data.currentProtocolVersion
  const tally = votes.data?.data.tally
  const voters = votes.data?.data.rows.length
  const upgrade = radar.data?.data.upgrade
  const total = upgrade?.enabled_evonodes ?? voters
  const needed = upgrade?.required ?? (voters === undefined ? undefined : thresholdOf(voters))
  const forNext =
    state.data?.data.voteCount != null
      ? Number(state.data.data.voteCount)
      : next !== null && tally
        ? (tally.get(next) ?? 0)
        : tally
          ? 0
          : undefined

  return (
    <PageFrame
      path="/protocol"
      title={t`Protocol`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`The Platform protocol version in force, and how the evonodes are voting on the next one.`}
    >
      <Card
        id="vote"
        layer="network"
        title={t`Upgrade vote`}
        subtitle={
          next === null && state.data
            ? t`No upgrade to a newer protocol version is being voted on.`
            : undefined
        }
        source={stampsOf(state.data, votes.data, radar.data)}
        {...queryView(state)}
      >
        {state.data ? (
          <div className="grid grid-cols-1 gap-4">
            <Stats>
              <Stat label={t`Current version`} value={`v${current}`} layer="network" />
              <Stat
                label={t`Next version`}
                value={next === null ? t`None proposed` : `v${next}`}
                layer="network"
              />
              <Stat
                label={t`Votes for it`}
                value={forNext === undefined ? '…' : formatInt(forNext)}
                note={
                  total !== undefined && needed !== undefined
                    ? t`${formatInt(needed)} of ${formatInt(total)} evonodes are needed`
                    : undefined
                }
                layer="network"
              />
            </Stats>
            {forNext !== undefined && total !== undefined && needed !== undefined ? (
              <Meter
                label={next === null ? t`Votes for a newer version` : t`Votes for v${next}`}
                value={forNext}
                max={Math.max(total, 1)}
                format={(v) => t`${formatInt(v)} of ${formatInt(total)}`}
                marker={{ at: needed, label: t`Threshold ${formatInt(needed)}` }}
              />
            ) : null}
            <Threshold
              off={off}
              devnet={devnet}
              upgrade={upgrade}
              voters={voters}
              forNext={forNext}
              needed={needed}
              total={total}
              share={
                upgrade && upgrade.enabled_evonodes > 0
                  ? upgrade.required / upgrade.enabled_evonodes
                  : ACTIVATION_SHARE
              }
            />
          </div>
        ) : null}
      </Card>
      <Tally votes={votes} />
      <VoteTable votes={votes} />
    </PageFrame>
  )
}

function Threshold({
  off,
  devnet,
  upgrade,
  voters,
  forNext,
  needed,
  total,
  share,
}: {
  off: boolean
  devnet: boolean
  upgrade: RadarPlatform['upgrade'] | undefined
  voters: number | undefined
  forNext: number | undefined
  needed: number | undefined
  total: number | undefined
  share: number
}) {
  const { t } = useLingui()
  const pending =
    total !== undefined && forNext !== undefined ? Math.max(0, total - forNext) : undefined
  const missing =
    needed !== undefined && forNext !== undefined ? Math.max(0, needed - forNext) : undefined
  return (
    <div className="grid grid-cols-1 gap-3">
      <KeyValue
        columns={2}
        items={[
          {
            label: t`Activation threshold`,
            value:
              needed === undefined || total === undefined
                ? '…'
                : t`${formatInt(needed)} of ${formatInt(total)} evonodes (${formatPercent(share, 0)})`,
            hint: upgrade
              ? undefined
              : t`Stated from the protocol’s rule of two thirds of the evonodes that vote${voters === undefined ? '' : `, ${formatInt(voters)} now`}.`,
          },
          {
            label: t`Pending votes`,
            value: pending === undefined ? '…' : formatInt(pending),
            hint: t`Evonodes not yet voting for it`,
          },
          {
            label: t`Still needed`,
            value: missing === undefined ? '…' : formatInt(missing),
          },
          ...(upgrade
            ? [
                { label: t`Phase`, value: upgrade.phase },
                {
                  label: t`Next epoch’s version`,
                  value: upgrade.next_epoch == null ? '—' : `v${upgrade.next_epoch}`,
                  hint:
                    upgrade.next_epoch_reported_by == null
                      ? undefined
                      : plural(upgrade.next_epoch_reported_by, {
                          one: 'Reported by # evonode',
                          other: 'Reported by # evonodes',
                        }),
                },
                {
                  label: t`Candidate version`,
                  value: upgrade.candidate == null ? t`None` : `v${upgrade.candidate}`,
                },
              ]
            : []),
        ]}
      />
      {off ? (
        <Unavailable
          compact
          source="radar"
          title={t`Radar’s exact threshold, phase and per-candidate counts need Radar’s crawl`}
        />
      ) : devnet ? (
        <Empty kind="unsupported-network" title={t`Radar doesn’t crawl devnets`} />
      ) : null}
    </div>
  )
}

function Tally({ votes }: { votes: VotesQuery }) {
  const { t } = useLingui()
  const rows = useMemo(
    () => [...(votes.data?.data.tally ?? [])].sort((a, b) => b[0] - a[0]),
    [votes.data],
  )
  const voters = votes.data?.data.rows.length ?? 0
  const columns = useMemo<ColumnDef<[number, number]>[]>(
    () => [
      {
        id: 'version',
        header: t`Version`,
        accessorFn: (r) => `v${r[0]}`,
        meta: { phone: 'title' },
      },
      {
        id: 'evonodes',
        header: t`Evonodes`,
        accessorFn: (r) => formatInt(r[1]),
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'share',
        header: t`Share`,
        accessorFn: (r) => formatPercent(voters === 0 ? 0 : r[1] / voters, 1),
        meta: { numeric: true, phone: 'secondary' },
      },
    ],
    [t, voters],
  )
  return (
    <Card
      id="tally"
      layer="network"
      title={t`Votes by version`}
      subtitle={t`How many evonodes vote for each protocol version.`}
      padding="flush"
      source={stampsOf(votes.data)}
    >
      <DataTable
        caption={t`Evonodes by the protocol version they vote for`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r[0])}
        {...queryView(votes)}
        empty={t`No evonode has voted.`}
      />
    </Card>
  )
}

function VoteTable({ votes }: { votes: VotesQuery }) {
  const { t } = useLingui()
  const { sort } = useSearch({ from: '/protocol' })
  const navigate = useNavigate()
  const [shown, setShown] = useState(PAGE)
  const rows = useMemo(
    () =>
      sortRows(votes.data?.data.rows ?? [], sort, {
        version: (r: VoteRow) => r.version,
        node: (r: VoteRow) => r.proTxHash,
      }),
    [votes.data, sort],
  )
  const columns = useMemo<ColumnDef<VoteRow>[]>(
    () => [
      {
        id: 'node',
        header: t`Evonode`,
        accessorFn: (r) => r.proTxHash,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.proTxHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'version',
        header: t`Votes for`,
        accessorFn: (r) => `v${r.version}`,
        meta: { numeric: true, phone: 'primary' },
      },
    ],
    [t],
  )
  const pages = votes.data?.data.pages ?? 0
  return (
    <Card
      id="vote-table"
      layer="network"
      title={t`Each evonode’s vote`}
      subtitle={
        pages > 1
          ? plural(pages, {
              one: 'Combined from # proof-checked answer.',
              other: 'Combined from # proof-checked answers.',
            })
          : undefined
      }
      padding="flush"
      source={stampsOf(votes.data)}
    >
      <DataTable
        caption={t`The protocol version each evonode votes for`}
        columns={columns}
        rows={rows.slice(0, shown)}
        getRowId={(r) => r.proTxHash}
        sort={{
          value: sort,
          onChange: (next) => {
            setShown(PAGE)
            void navigate({
              to: '.',
              search: ((prev: Record<string, unknown>) => ({ ...prev, sort: next })) as never,
            })
          },
        }}
        {...queryView(votes)}
        empty={t`No evonode has voted.`}
        paging={
          shown < rows.length
            ? {
                kind: 'infinite',
                hasNext: true,
                fetching: false,
                fetchNext: () => {
                  setShown((n) => n + PAGE)
                },
              }
            : undefined
        }
      />
    </Card>
  )
}
