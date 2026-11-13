import { useLingui } from '@lingui/react/macro'
import { useQueries } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { ContractTokenDto } from '@/data/sdk/methods'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Empty } from '@/ui'
import type { ContractContext } from './contract-context'

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

/** The token's name and decimals as its contract states them (`conventions`). */
export function tokenFacts(token: ContractTokenDto) {
  const conventions = asRecord(token.config.conventions)
  const en = asRecord(asRecord(conventions.localizations).en)
  const supply = (v: unknown) => (typeof v === 'number' || typeof v === 'bigint' ? v : undefined)
  return {
    name: typeof en.singularForm === 'string' ? en.singularForm : undefined,
    decimals: typeof conventions.decimals === 'number' ? conventions.decimals : undefined,
    baseSupply: supply(token.config.baseSupply),
    maxSupply: supply(token.config.maxSupply),
  }
}

interface Row {
  token: ContractTokenDto
  tokenId: string | undefined
}

export function TokensTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { net, id, contract, stamp } = ctx
  const ids = useQueries({
    queries: contract.tokens.map((token) =>
      sdkQueries['tokens.calculateId'](net, { contractId: id, position: token.position }),
    ),
  })
  const rows: Row[] = contract.tokens.map((token, i) => ({
    token,
    tokenId: ids[i]?.data?.data,
  }))
  const stamps: SourceStamp[] = [
    stamp,
    ...ids.flatMap((q) => {
      if (!q.data) return []
      const { data: _data, ...rest } = q.data
      return [rest]
    }),
  ]
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'position',
        header: t`Position`,
        cell: ({ row }) => row.original.token.position,
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'token',
        header: t`Token ID`,
        cell: ({ row }) =>
          row.original.tokenId ? <Entity kind="token" id={row.original.tokenId} /> : '…',
        meta: { phone: 'primary' },
      },
      {
        id: 'name',
        header: t`Name`,
        cell: ({ row }) => tokenFacts(row.original.token).name ?? '—',
      },
      {
        id: 'decimals',
        header: t`Decimals`,
        cell: ({ row }) => tokenFacts(row.original.token).decimals ?? '—',
        meta: { numeric: true },
      },
      {
        id: 'base',
        header: t`Base supply`,
        cell: ({ row }) => {
          const v = tokenFacts(row.original.token).baseSupply
          return v === undefined ? '—' : formatInt(v)
        },
        meta: { numeric: true },
      },
      {
        id: 'max',
        header: t`Maximum supply`,
        cell: ({ row }) => {
          const v = tokenFacts(row.original.token).maxSupply
          return v === undefined ? '—' : formatInt(v)
        },
        meta: { numeric: true },
      },
    ],
    [t],
  )
  return (
    <Card title={t`Tokens`} layer="platform" source={stamps} id="tokens">
      <DataTable
        caption={t`Tokens of this contract`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.token.position)}
        state={rows.length === 0 ? 'empty' : 'ready'}
        empty={<Empty kind="none-yet" title={t`This contract defines no tokens.`} />}
        rowLink={(r) =>
          r.tokenId
            ? ({ to: '/token/$id', params: { id: r.tokenId } } as never)
            : ({ to: '.' } as never)
        }
      />
    </Card>
  )
}
