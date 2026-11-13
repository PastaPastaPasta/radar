import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkBatchers, sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatAmountText } from '@/lib/units'
import { wellKnownTokens } from '@/lib/well-known'
import { Amount, Badge, Card, DataTable, Empty, Unavailable } from '@/ui'
import { loadState, peChildQuery, useSetSearch, type IdentityTabProps } from './common'
import { IdForm } from './IdForm'

interface TokenRow {
  id: string
  symbol?: string
  name?: string
  decimals?: number
  added: boolean
}

export function TokensTab({ id, tokens }: IdentityTabProps & { tokens: string[] }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const setSearch = useSetSearch()

  const rows = useMemo<TokenRow[]>(() => {
    const known = wellKnownTokens(net)
    const out: TokenRow[] = known.map((k) => ({
      id: k.id,
      symbol: k.symbol,
      name: k.name,
      decimals: k.decimals,
      added: false,
    }))
    for (const tokenId of tokens) {
      if (isPlatformId(tokenId) && !out.some((r) => r.id === tokenId))
        out.push({ id: tokenId, added: true })
    }
    return out
  }, [net, tokens])

  const balances = useQueries({
    queries: rows.map((r) =>
      sdkBatchers.tokenBalance.queryOptions(net, { tokenId: r.id, identityId: id }),
    ),
  })
  const infos = useQuery({
    ...sdkQueries['tokens.identityTokenInfos'](net, {
      identityId: id,
      tokenIds: rows.map((r) => r.id),
    }),
    enabled: rows.length > 0,
  })
  const indexed = useQuery({
    ...peQueries.identityTokens(net, id, peChildQuery(1)),
    enabled: !decentralized,
  })

  const stamps: SourceStamp[] = [
    ...balances.flatMap((b) => (b.data ? [stampOf(b.data)] : [])),
    ...(infos.data ? [stampOf(infos.data)] : []),
  ]

  const columns = useMemo<ColumnDef<TokenRow>[]>(
    () => [
      {
        id: 'token',
        header: t`Token`,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <Entity kind="token" id={row.original.id} />
            {row.original.symbol ? <Badge>{row.original.symbol}</Badge> : null}
          </span>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        cell: ({ row }) => {
          const index = rows.findIndex((r) => r.id === row.original.id)
          const q = balances[index]
          if (!q || q.isPending) return t`Loading…`
          if (q.isError) return <span className="text-bad">{t`Not available`}</span>
          const value = q.data?.data ?? 0n
          return row.original.decimals === undefined ? (
            <span className="rx-num" data-token-balance>{`${value} ${t`units`}`}</span>
          ) : (
            <span data-token-balance>
              <Amount
                value={value}
                kind={{ token: { decimals: row.original.decimals, symbol: row.original.symbol } }}
              />
            </span>
          )
        },
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'state',
        header: t`State`,
        cell: ({ row }) => {
          if (infos.isPending) return t`Loading…`
          if (infos.isError) return <span className="text-bad">{t`Not available`}</span>
          const info = infos.data?.data.get(row.original.id)
          return info?.frozen ? (
            <Badge tone="danger">{t`Frozen`}</Badge>
          ) : (
            <Badge tone="success">{t`Not frozen`}</Badge>
          )
        },
        meta: { phone: 'secondary' },
      },
      {
        id: 'remove',
        header: '',
        cell: ({ row }) =>
          row.original.added ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm relative z-[1]"
              aria-label={t`Remove token ${row.original.id}`}
              onClick={() => {
                const next = tokens.filter((x) => x !== row.original.id)
                setSearch({ tokens: next.length > 0 ? next : undefined })
              }}
            >
              {t`Remove`}
            </button>
          ) : null,
        meta: { phone: 'secondary' },
      },
    ],
    [t, rows, balances, infos.isPending, infos.isError, infos.data, tokens, setSearch],
  )

  const indexedRows = indexed.data?.data.items ?? []
  return (
    <div className="grid gap-4">
      <Card
        title={t`Token balances`}
        layer="platform"
        id="identity-tokens"
        source={stamps.length > 0 ? stamps : undefined}
        subtitle={t`Proof-checked balances for well-known tokens and any token ID you add.`}
      >
        <DataTable
          caption={t`Token balances`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          state="ready"
          empty={<Empty kind="none-yet" title={t`No tokens to check.`} />}
        />
        <IdForm
          label={t`Add a token ID`}
          submit={t`Add`}
          invalid={t`That isn’t a token ID: it is 43 or 44 base58 characters.`}
          clearOnSubmit
          onSubmit={(value) => {
            if (!rows.some((r) => r.id === value)) setSearch({ tokens: [...tokens, value].sort() })
          }}
        />
      </Card>
      {decentralized ? (
        <Unavailable
          title={t`The tokens Platform Explorer has indexed for this identity need an indexer`}
        />
      ) : (
        <Card
          title={t`Indexed tokens`}
          layer="platform"
          id="identity-indexed-tokens"
          source={indexed.data ? stampOf(indexed.data) : undefined}
          subtitle={t`Tokens Platform Explorer has seen this identity hold.`}
        >
          <DataTable
            caption={t`Indexed tokens`}
            columns={[
              {
                id: 'token',
                header: t`Token`,
                cell: ({ row }) => <Entity kind="token" id={row.original.identifier} />,
                meta: { phone: 'title' },
              },
              {
                id: 'balance',
                header: t`Balance (indexed)`,
                cell: ({ row }) =>
                  row.original.balance === null || row.original.balance === undefined
                    ? '—'
                    : formatAmountText(row.original.balance, {
                        token: { decimals: row.original.decimals ?? 0 },
                      }),
                meta: { align: 'end', numeric: true, phone: 'primary' },
              },
              {
                id: 'check',
                header: '',
                cell: ({ row }) =>
                  rows.some((r) => r.id === row.original.identifier) ? null : (
                    <button
                      type="button"
                      className="dh-btn dh-btn--sm relative z-[1]"
                      onClick={() => {
                        setSearch({ tokens: [...tokens, row.original.identifier].sort() })
                      }}
                    >
                      {t`Check on-chain`}
                    </button>
                  ),
                meta: { phone: 'secondary' },
              },
            ]}
            rows={indexedRows}
            getRowId={(r) => r.identifier}
            state={loadState(indexed)}
            error={indexed.error}
            onRetry={() => void indexed.refetch()}
            empty={
              <Empty
                kind="none-yet"
                title={t`Platform Explorer has no tokens for this identity.`}
              />
            }
          />
        </Card>
      )}
    </div>
  )
}
