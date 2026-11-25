import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeToken } from '@/data/pe/schemas'
import { sdkQueries } from '@/data/sdk/queries'
import {
  Entity,
  IdentityRef,
  PageFrame,
  ScrollList,
  useNetwork,
  pagePosition,
} from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { wellKnownTokens } from '@/lib/well-known'
import {
  ActiveFilters,
  Amount,
  Card,
  DataTable,
  Empty,
  ErrorState,
  SegFilter,
  TableTools,
  Unavailable,
} from '@/ui'
import { FilterPanel, TextFilter } from '../blocks/list-chrome'
import { BOARD_PAGE, rankDesc } from '../home/rank'
import { useListControls } from '../blocks/use-list-controls'
import { usePeScroll } from '../pe-scroll'
import { ByContractForm } from '../token/ByContractForm'
import { localizationsOf, pickLocalization } from '../token/token-config'
import { NEWEST_FIRST, textFilter, tokensQuery, type TokensSearch } from './token-list'

const TRENDING_SHOWN = 5

export function TokensPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  return (
    <PageFrame
      path="/tokens"
      title={t`Tokens`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Every token Platform Explorer has indexed, with its supply, price and contract.`}
    >
      <OpenToken />
      {decentralized ? (
        <Unavailable
          source="pe"
          title={t`Platform keeps no list of tokens; this needs Platform Explorer's index. Open a token by its ID, or by its contract and position, above.`}
        />
      ) : isDevnet(net) ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      ) : (
        <>
          <Trending />
          <TokenList />
        </>
      )}
    </PageFrame>
  )
}

function OpenToken() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState(false)
  return (
    <Card title={t`Open a token`} layer="platform" id="tokens-open">
      <div className="grid gap-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const id = draft.trim()
            if (!isPlatformId(id)) {
              setProblem(true)
              return
            }
            setProblem(false)
            void navigate({ to: '/token/$id', params: { id } })
          }}
        >
          <label className="grid gap-1">
            <span>{t`Token ID`}</span>
            <input
              className="dh-input dh-input--sm"
              style={{ width: 'min(100%, 24rem)' }}
              value={draft}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={problem ? true : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
            />
          </label>
          <button type="submit" className="dh-btn dh-btn--sm">
            {t`Open`}
          </button>
          {problem ? (
            <span role="alert" className="basis-full text-bad">
              {t`That isn’t a token ID: it is 43 or 44 base58 characters.`}
            </span>
          ) : null}
        </form>
        <div className="grid gap-2">
          <p className="font-semibold">{t`Or from its contract and position`}</p>
          <ByContractForm />
        </div>
      </div>
    </Card>
  )
}

/** The name a row shows: the UI language's from the index's own localisations, else the well-known symbol. */
function useNameOf() {
  const { i18n } = useLingui()
  const net = useNetwork()
  return useCallback(
    (id: string, localizations: PeToken['localizations']): string | undefined => {
      const known = wellKnownTokens(net).find((k) => k.id === id)
      const parsed = localizationsOf({ conventions: { localizations: localizations ?? {} } })
      return pickLocalization(parsed, i18n.locale)?.singular ?? known?.symbol
    },
    [net, i18n.locale],
  )
}

function Trending() {
  const { t } = useLingui()
  const net = useNetwork()
  const nameOf = useNameOf()
  const q = useQuery(peQueries.tokenRating(net, BOARD_PAGE))
  const rows = rankDesc(q.data?.data.items ?? [], (r) => r.transitionCount)
    .map((r) => r.item)
    .filter((r) => r.transitionCount > 0)
    .slice(0, TRENDING_SHOWN)
  if (q.isSuccess && rows.length === 0) return null
  return (
    <Card
      title={t`Trending`}
      subtitle={t`Tokens with the most recent transitions`}
      layer="platform"
      id="tokens-trending"
      source={q.data ? stampOf(q.data) : undefined}
      state={q.isPending ? 'loading' : q.isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'}
      error={q.error}
      onRetry={() => void q.refetch()}
    >
      {rows.length === 0 ? (
        <Empty kind="none-yet" title={t`No token has recent activity.`} />
      ) : (
        <ol className="grid gap-2" data-trending>
          {rows.map((r) => (
            <li
              key={r.tokenIdentifier}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <Entity
                kind="token"
                id={r.tokenIdentifier}
                label={nameOf(r.tokenIdentifier, r.localizations)}
              />
              <span className="text-ink-2">{t`${formatInt(r.transitionCount)} transitions`}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function TokenList() {
  const { t } = useLingui()
  const net = useNetwork()
  const controls = useListControls<TokensSearch>('/tokens')
  const { search } = controls
  const { limit } = search
  const nameOf = useNameOf()
  const query = useMemo(() => tokensQuery(search), [search])

  const list = usePeScroll({
    listKey: JSON.stringify(query),
    start: search.page,
    limit,
    page: (page) => peQueries.tokens(net, { ...query, page, limit }),
    getRowId: (r: PeToken) => r.identifier,
  })

  // Each page's prices are one read, so a page that scrolls back into view asks for nothing new.
  const priceReads = useQueries({
    queries: list.pages.map((p) => {
      const tokenIds = p.data?.data.items.map((r) => r.identifier) ?? []
      return {
        ...sdkQueries['tokens.directPurchasePrices'](net, { tokenIds }),
        enabled: tokenIds.length > 0 && tokenIds.length <= 100,
      }
    }),
  })
  const prices = useMemo(() => {
    const of = new Map<string, { pending: boolean; price: bigint | undefined }>()
    list.pages.forEach((p, i) => {
      const read = priceReads[i]
      for (const r of p.data?.data.items ?? []) {
        of.set(r.identifier, {
          pending: read?.isPending === true,
          price: read?.data?.data.get(r.identifier)?.currentPrice,
        })
      }
    })
    return of
  }, [list.pages, priceReads])
  const priceFailed = priceReads.find((q) => q.isError && !q.data)

  const columns = useMemo<ColumnDef<PeToken>[]>(
    () => [
      {
        id: 'token',
        header: t`Token`,
        cell: ({ row }) => (
          <Entity
            kind="token"
            id={row.original.identifier}
            label={nameOf(row.original.identifier, row.original.localizations)}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'position',
        header: t`Position`,
        accessorFn: (r) => (r.position == null ? '—' : formatInt(r.position)),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'supply',
        header: t`Supply`,
        cell: ({ row }) => {
          const { totalSupply, decimals, identifier } = row.original
          const known = wellKnownTokens(net).find((k) => k.id === identifier)
          const d = decimals ?? known?.decimals
          if (totalSupply == null) return '—'
          return d === undefined ? (
            formatInt(totalSupply)
          ) : (
            <Amount value={totalSupply} kind={{ token: { decimals: d, symbol: known?.symbol } }} />
          )
        },
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'price',
        header: t`Price`,
        cell: ({ row }) => {
          const read = prices.get(row.original.identifier)
          if (!read || read.pending) return '…'
          return read.price !== undefined ? <Amount value={read.price} kind="credits" /> : '—'
        },
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'contract',
        header: t`Contract`,
        cell: ({ row }) => (
          <Entity
            kind="contract"
            id={row.original.dataContractIdentifier}
            search={{ tab: 'tokens' }}
          />
        ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'owner',
        header: t`Owner`,
        cell: ({ row }) =>
          row.original.owner?.identifier ? <IdentityRef id={row.original.owner.identifier} /> : '—',
        meta: { phone: 'hidden' },
      },
    ],
    [t, net, nameOf, prices],
  )

  const active = [
    ...(search.q ? [{ id: 'q', label: t`Name or ID: ${search.q}` }] : []),
    ...(search.owner ? [{ id: 'owner', label: t`Owner: ${search.owner.slice(0, 8)}…` }] : []),
    ...(search.contract
      ? [{ id: 'contract', label: t`Contract: ${search.contract.slice(0, 8)}…` }]
      : []),
  ]
  const stamps: SourceStamp[] = [
    ...list.stamps.slice(0, 1),
    ...priceReads.flatMap((q) => (q.data ? [stampOf(q.data)] : [])),
  ]
  const newest = search.sort === NEWEST_FIRST

  return (
    <Card layer="platform" id="tokens-list" source={stamps.length > 0 ? stamps : undefined}>
      <TableTools>
        <SegFilter
          label={t`Order`}
          value={newest ? 'new' : 'old'}
          onChange={(id) => {
            controls.filter({ sort: id === 'new' ? NEWEST_FIRST : undefined })
          }}
          options={[
            { id: 'old', label: t({ message: 'Oldest first', context: 'list of tokens' }) },
            { id: 'new', label: t({ message: 'Newest first', context: 'list of tokens' }) },
          ]}
        />
      </TableTools>
      <FilterPanel count={active.length}>
        <TextFilter
          label={t`Name or token ID`}
          placeholder={t`Start of a name, or a token ID`}
          value={search.q}
          check={(v) =>
            Object.keys(textFilter(v)).length > 0
              ? undefined
              : t`Use up to 25 letters, digits or hyphens, or a token ID.`
          }
          onChange={(q) => {
            controls.filter({ q })
          }}
        />
        <TextFilter
          label={t`Owner`}
          placeholder={t`Identity ID of the contract owner`}
          value={search.owner}
          check={(v) =>
            isPlatformId(v) ? undefined : t`An identity ID is 43 or 44 base58 characters.`
          }
          onChange={(owner) => {
            controls.filter({ owner })
          }}
        />
        <TextFilter
          label={t`Contract`}
          placeholder={t`Contract ID`}
          value={search.contract}
          check={(v) =>
            isPlatformId(v) ? undefined : t`A contract ID is 43 or 44 base58 characters.`
          }
          onChange={(contract) => {
            controls.filter({ contract })
          }}
        />
      </FilterPanel>
      {active.length > 0 ? (
        <ActiveFilters
          matches={list.total ?? list.rows.length}
          tokens={active}
          onRemove={(id) => {
            controls.filter({ [id]: undefined })
          }}
          onClear={() => {
            controls.filter({ q: undefined, owner: undefined, contract: undefined })
          }}
        />
      ) : null}
      {priceFailed ? (
        <ErrorState
          error={priceFailed.error}
          source="sdk"
          compact
          onRetry={() => void priceFailed.refetch()}
        />
      ) : null}
      <ScrollList chain={list} position={pagePosition}>
        <DataTable
          caption={t`Tokens`}
          columns={columns}
          rows={list.rows}
          getRowId={list.getRowId}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          paging={list.paging}
          rowLink={(r) => ({ to: '/token/$id', params: { id: r.identifier } })}
          empty={
            <Empty
              kind={active.length > 0 ? 'no-match' : 'none-yet'}
              title={
                active.length > 0
                  ? t`No token matches these filters`
                  : t`Platform Explorer has no tokens yet`
              }
            />
          }
        />
      </ScrollList>
    </Card>
  )
}
