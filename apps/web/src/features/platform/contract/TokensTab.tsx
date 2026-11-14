import { useLingui } from '@lingui/react/macro'
import { useQueries } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { ContractTokenDto } from '@/data/sdk/methods'
import { Entity, useNetwork } from '@/features/entity'
import { wellKnownTokens } from '@/lib/well-known'
import { Amount, Card, DataTable, Empty } from '@/ui'
import { decimalsOf, localizationsOf, pickLocalization, supplyOf } from '../token/token-config'
import type { ContractContext } from './contract-context'

/** The token's name, decimals and supplies as its contract states them (`conventions`, `baseSupply`, `maxSupply`). */
function tokenFacts(token: ContractTokenDto, locale: string) {
  const name = pickLocalization(localizationsOf(token.config), locale)?.singular
  return {
    name,
    decimals: decimalsOf(token.config),
    baseSupply: supplyOf(token.config, 'baseSupply'),
    maxSupply: supplyOf(token.config, 'maxSupply'),
  }
}

interface Row {
  token: ContractTokenDto
  tokenId: string | undefined
}

/** One fact about a token; a supply is in whole tokens with the symbol, as the token's own page shows it. */
function FactCell({
  row,
  field,
}: {
  row: Row
  field: 'name' | 'decimals' | 'baseSupply' | 'maxSupply'
}) {
  const { t, i18n } = useLingui()
  const known = wellKnownTokens(useNetwork())
  const facts = tokenFacts(row.token, i18n.locale)
  if (field === 'name' || field === 'decimals') return facts[field] ?? '—'
  const value = facts[field]
  if (value === undefined) return '—'
  if (facts.decimals === undefined) return <span className="rx-num">{`${value} ${t`units`}`}</span>
  const symbol = known.find((k) => k.id === row.tokenId)?.symbol ?? facts.name
  return <Amount value={value} kind={{ token: { decimals: facts.decimals, symbol } }} />
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
  const stamps: SourceStamp[] = [stamp, ...ids.flatMap((q) => (q.data ? [stampOf(q.data)] : []))]
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
          row.original.tokenId ? <Entity kind="token" id={row.original.tokenId} byId /> : '…',
        meta: { phone: 'primary' },
      },
      {
        id: 'name',
        header: t`Name`,
        cell: ({ row }) => <FactCell row={row.original} field="name" />,
      },
      {
        id: 'decimals',
        header: t`Decimals`,
        cell: ({ row }) => <FactCell row={row.original} field="decimals" />,
        meta: { numeric: true },
      },
      {
        id: 'base',
        header: t`Base supply`,
        cell: ({ row }) => <FactCell row={row.original} field="baseSupply" />,
        meta: { numeric: true },
      },
      {
        id: 'max',
        header: t`Maximum supply`,
        cell: ({ row }) => <FactCell row={row.original} field="maxSupply" />,
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
