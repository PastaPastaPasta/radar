import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { GroupActionDto, GroupActionStatus, GroupMemberDto } from '@/data/sdk/methods/p-data'
import { Entity, IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import {
  Badge,
  Card,
  DataTable,
  Empty,
  ErrorState,
  Hash,
  JsonView,
  KeyValue,
  Skeleton,
  Tabs,
} from '@/ui'
import { SdkGate } from '../contract/SdkGate'

export interface GroupPageProps {
  contract: string
  pos: string
  search: { tab: 'members' | 'actions'; status: GroupActionStatus }
}

/** Members listed, and actions read, this many at a time. */
const GROUP_PAGE = 100
const ACTIONS_PAGE = 25

function groupLink(contract: string, pos: string, patch: Record<string, unknown>): LinkProps {
  return {
    to: '/group/$contract/$pos',
    params: { contract, pos },
    search: (s: Record<string, unknown>) => ({ ...s, ...patch }),
  } as LinkProps
}

export function GroupPage({ contract, pos, search }: GroupPageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const position = /^\d+$/.test(pos) ? Number(pos) : -1
  const valid = isPlatformId(contract) && position >= 0
  const info = useQuery({
    ...sdkQueries['group.info'](net, { contractId: contract, position }),
    enabled: valid,
  })
  const group = info.data?.data ?? null
  return (
    <PageFrame
      path="/group/$contract/$pos"
      title={t`Group`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={t`Position ${pos}`}
    >
      {!valid ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a group address.`}
          body={<Hash value={contract} display="wrap" copy={false} />}
        />
      ) : (
        <SdkGate query={info} skeleton={<Skeleton shape="block" height={160} />}>
          {!group || !info.data ? (
            <Empty
              kind="not-found"
              title={t`This contract has no group at position ${pos}.`}
              body={
                <Link to="/groups/$contract" params={{ contract }}>
                  {t`See the groups of this contract`}
                </Link>
              }
            />
          ) : (
            <>
              <Card title={t`Group`} layer="platform" source={stampOf(info.data)} id="group">
                <KeyValue
                  columns={2}
                  items={[
                    { label: t`Contract`, value: <Entity kind="contract" id={contract} /> },
                    { label: t`Position`, value: String(position) },
                    { label: t`Required power`, value: formatInt(group.requiredPower) },
                    { label: t`Members`, value: formatInt(group.members.length) },
                  ]}
                />
              </Card>
              <div className="min-w-0">
                <Tabs
                  tabs={[
                    { id: 'members', label: t`Members`, count: group.members.length },
                    { id: 'actions', label: t`Actions` },
                  ]}
                  value={search.tab}
                  layer="platform"
                  to={(id) => groupLink(contract, pos, { tab: id === 'members' ? undefined : id })}
                />
              </div>
              {search.tab === 'members' ? (
                <Members contract={contract} position={position} required={group.requiredPower} />
              ) : (
                <Actions
                  contract={contract}
                  pos={pos}
                  position={position}
                  status={search.status}
                  required={group.requiredPower}
                />
              )}
            </>
          )}
        </SdkGate>
      )}
    </PageFrame>
  )
}

function Members({
  contract,
  position,
  required,
}: {
  contract: string
  position: number
  required: number
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const members = useQuery(
    sdkQueries['group.members'](net, { contractId: contract, position, limit: GROUP_PAGE }),
  )
  const columns = useMemo<ColumnDef<GroupMemberDto>[]>(
    () => [
      {
        id: 'member',
        header: t`Member`,
        cell: ({ row }) => <IdentityRef id={row.original.id} />,
        meta: { phone: 'title' },
      },
      {
        id: 'power',
        header: t`Power`,
        cell: ({ row }) => formatInt(row.original.power),
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'share',
        header: t`Of the required`,
        cell: ({ row }) =>
          required > 0 ? `${formatInt(row.original.power)} / ${formatInt(required)}` : '—',
        meta: { numeric: true, phone: 'secondary' },
      },
    ],
    [t, required],
  )
  return (
    <Card
      title={t`Members`}
      layer="platform"
      id="members"
      source={members.data ? stampOf(members.data) : undefined}
    >
      <SdkGate query={members} skeleton={<Skeleton shape="row" count={3} />}>
        {(members.data?.data.length ?? 0) === 0 ? (
          <Empty kind="none-yet" title={t`This group has no members.`} />
        ) : (
          <DataTable
            caption={t`Members by power`}
            columns={columns}
            rows={members.data?.data ?? []}
            getRowId={(m) => m.id}
            state="ready"
          />
        )}
      </SdkGate>
    </Card>
  )
}

function Actions({
  contract,
  pos,
  position,
  status,
  required,
}: {
  contract: string
  pos: string
  position: number
  status: GroupActionStatus
  required: number
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const [cursors, setCursors] = useState<Record<string, (string | undefined)[]>>({})
  const mine = cursors[status] ?? [undefined]
  const queries = useQueries({
    queries: mine.map((startAfter) =>
      sdkQueries['group.actions'](net, {
        contractId: contract,
        position,
        status,
        limit: ACTIONS_PAGE,
        ...(startAfter === undefined ? {} : { startAfter }),
      }),
    ),
  })
  const actions = queries.flatMap((q) => q.data?.data ?? [])
  const first = queries[0]
  const lastChunk = queries.at(-1)?.data?.data ?? []
  const stamps: SourceStamp[] = queries.flatMap((q) => (q.data ? [stampOf(q.data)] : []))
  return (
    <Card
      title={t`Actions`}
      layer="platform"
      id="actions"
      source={stamps}
      actions={
        <nav aria-label={t`Status`} className="flex gap-2" data-status-filter>
          {(['active', 'closed'] as const).map((id) => (
            <Link
              key={id}
              className="dh-btn dh-btn--sm"
              aria-current={status === id ? 'true' : undefined}
              {...groupLink(contract, pos, {
                tab: 'actions',
                status: id === 'active' ? undefined : id,
              })}
            >
              {id === 'active' ? t`Active` : t`Closed`}
            </Link>
          ))}
        </nav>
      }
    >
      {first?.isPending ? (
        <Skeleton shape="row" count={3} />
      ) : first?.isError && !first.data ? (
        <ErrorState
          error={first.error}
          source="sdk"
          onRetry={() => {
            void first.refetch()
          }}
        />
      ) : actions.length === 0 ? (
        <Empty
          kind="none-yet"
          title={
            status === 'active'
              ? t`No action is waiting for signatures.`
              : t`No action has closed yet.`
          }
        />
      ) : (
        <div className="grid gap-4">
          <ul className="grid gap-3" aria-label={t`Actions`}>
            {actions.map((a) => (
              <ActionRow
                key={a.id}
                contract={contract}
                position={position}
                status={status}
                action={a}
                required={required}
              />
            ))}
          </ul>
          {lastChunk.length === ACTIONS_PAGE ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm justify-self-start"
              onClick={() => {
                const last = lastChunk[lastChunk.length - 1]
                if (!last) return
                setCursors((c) => ({ ...c, [status]: [...(c[status] ?? [undefined]), last.id] }))
              }}
            >
              {t`Load more actions`}
            </button>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function ActionRow({
  contract,
  position,
  status,
  action,
  required,
}: {
  contract: string
  position: number
  status: GroupActionStatus
  action: GroupActionDto
  required: number
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const [open, setOpen] = useState(false)
  const signers = useQuery({
    ...sdkQueries['group.actionSigners'](net, {
      contractId: contract,
      position,
      status,
      actionId: action.id,
    }),
    enabled: open,
  })
  const list = signers.data?.data ?? []
  const count = list.length
  const signed = list.reduce((n, s) => n + s.power, 0)
  const tokenPosition = action.tokenPosition
  const signedPower = formatInt(signed)
  const requiredPower = formatInt(required)
  const signerCount = plural(count, { one: '# signer', other: '# signers' })
  return (
    <li className="grid gap-2 border-t border-line pt-3" data-action={action.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{action.eventName}</Badge>
        <Hash value={action.id} />
        <span className="text-ink-2">{t`token position ${tokenPosition}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-2">{t`Proposed by`}</span>
        <IdentityRef id={action.proposerId} />
      </div>
      {action.note ? <p>{action.note}</p> : null}
      <button
        type="button"
        className="dh-btn dh-btn--sm justify-self-start"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
        }}
      >
        {open ? t`Hide signers` : t`Show signers`}
      </button>
      {open ? (
        <div className="grid gap-2" data-signers>
          <SdkGate query={signers} skeleton={<Skeleton shape="row" count={2} />} compact>
            <p className="text-ink-2">
              {required > 0
                ? t`${signerCount}, power ${signedPower} of ${requiredPower} required`
                : signerCount}
            </p>
            <ul className="flex flex-wrap gap-2">
              {list.map((s) => {
                const power = formatInt(s.power)
                return (
                  <li key={s.id} className="flex items-center gap-1" data-signer={s.id}>
                    <IdentityRef id={s.id} />
                    <Badge size="sm">{t`power ${power}`}</Badge>
                  </li>
                )
              })}
            </ul>
          </SdkGate>
          <JsonView value={action.event} collapsedDepth={1} label={t`Action details`} />
        </div>
      ) : null}
    </li>
  )
}
