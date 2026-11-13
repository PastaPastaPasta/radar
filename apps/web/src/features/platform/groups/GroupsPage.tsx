import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { ContractGroupDto } from '@/data/sdk/methods'
import { Entity, PageFrame, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Empty, ErrorState, Hash, Skeleton } from '@/ui'

export function GroupsPage({ contract }: { contract: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(contract)
  const infos = useQuery({
    ...sdkQueries['group.infos'](net, { contractId: contract }),
    enabled: valid,
  })
  const groups = infos.data?.data ?? []
  const columns = useMemo<ColumnDef<ContractGroupDto>[]>(
    () => [
      {
        id: 'position',
        header: t`Position`,
        cell: ({ row }) => row.original.position,
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'threshold',
        header: t`Required power`,
        cell: ({ row }) => formatInt(row.original.requiredPower),
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'members',
        header: t`Members`,
        cell: ({ row }) => formatInt(row.original.members.length),
        meta: { numeric: true },
      },
      {
        id: 'power',
        header: t`Total power`,
        cell: ({ row }) => formatInt(row.original.members.reduce((n, m) => n + m.power, 0)),
        meta: { numeric: true },
      },
    ],
    [t],
  )
  return (
    <PageFrame
      path="/groups/$contract"
      title={t`Groups`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`A group lists identities and the power each holds; a decision needs enough power to reach the group’s threshold.`}
    >
      {!valid ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a contract ID.`}
          body={<Hash value={contract} display="wrap" copy={false} />}
        />
      ) : (
        <Card
          title={t`Groups of this contract`}
          layer="platform"
          id="groups"
          source={infos.data ? stampOf(infos.data) : undefined}
          subtitle={<Entity kind="contract" id={contract} />}
          actions={
            <Link className="dh-btn dh-btn--sm" to="/contract/$id" params={{ id: contract }}>
              {t`Open the contract`}
            </Link>
          }
        >
          {infos.isPending ? (
            <Skeleton shape="row" count={3} />
          ) : infos.isError && !infos.data ? (
            <ErrorState
              error={infos.error}
              source="sdk"
              onRetry={() => {
                void infos.refetch()
              }}
            />
          ) : (
            <DataTable
              caption={t`Groups`}
              columns={columns}
              rows={groups}
              getRowId={(g) => String(g.position)}
              state={groups.length === 0 ? 'empty' : 'ready'}
              empty={
                <Empty
                  kind="none-yet"
                  title={t`This contract has no groups.`}
                  body={t`Only a contract that defines groups, usually for its tokens, has any.`}
                />
              }
              rowLink={(g) =>
                ({
                  to: '/group/$contract/$pos',
                  params: { contract, pos: String(g.position) },
                }) as never
              }
            />
          )}
        </Card>
      )}
    </PageFrame>
  )
}
