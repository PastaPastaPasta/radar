import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { ScrollList, TransitionTable, useNetwork, pagePosition } from '@/features/entity'
import { ActiveFilters, Card, Empty, TableTools } from '@/ui'
import { FilterPanel } from '../blocks/list-chrome'
import { usePeScroll } from '../pe-scroll'
import {
  NO_TRANSITION_FILTERS,
  StatusFilter,
  TransitionFilterFields,
  useTransitionFilterTokens,
  type TransitionFilterChange,
} from '../txs/filters'
import { ContractFilter, shortId, useContractNames } from './ContractFilter'
import { peChildQuery, useSetSearch } from './common'
import { identityTxsPlan, rowTarget, type IdentityTxFilters } from './tx-filters'

export function Transactions({
  id,
  page,
  filters,
}: {
  id: string
  page: number
  filters: IdentityTxFilters
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const setSearch = useSetSearch()
  const plan = identityTxsPlan(id, filters)
  const contract = filters.txcontract
  const matchesNothing = plan.filtered && plan.matchesNothing
  const list = usePeScroll({
    listKey: [
      'identity-tx',
      id,
      plan.filtered ? JSON.stringify(plan.query) : '',
      contract ?? '',
    ].join('\u0000'),
    start: page,
    limit: plan.limit,
    page: (n) =>
      plan.filtered
        ? peQueries.transactions(net, { ...plan.query, page: n, limit: plan.limit })
        : peQueries.identityTransactions(net, id, peChildQuery(n)),
    getRowId: (r: PeTransaction) => r.hash,
    keep: contract ? (r) => rowTarget(r)?.contract === contract : undefined,
    enabled: !matchesNothing,
  })
  const nameOf = useContractNames(net, contract ? [contract] : [], contract !== undefined)

  // The shared filters' `type` is this page's `txtype`: the Documents tab has a `type` of its own.
  const shared = { ...filters, type: filters.txtype }
  const change = (c: TransitionFilterChange & { txcontract?: string | undefined }) => {
    const { type, ...rest } = c
    setSearch({ ...rest, ...('type' in c ? { txtype: type } : {}), page: undefined })
  }
  const base = useTransitionFilterTokens(shared)
  const contractLabel = contract ? (nameOf(contract) ?? shortId(contract)) : ''
  const tokens = [
    ...(contract ? [{ id: 'contract', label: t`Contract: ${contractLabel}` }] : []),
    ...base.tokens,
  ]
  const active = tokens.length > 0
  const done = !list.paging.hasNext
  const reached = (list.pages.at(-1)?.param ?? page) * plan.limit

  return (
    <Card
      title={t`Transitions`}
      layer="platform"
      id="identity-transactions"
      source={list.stamps[0]}
    >
      <TableTools>
        <StatusFilter value={filters.status} onChange={change} />
      </TableTools>
      <FilterPanel count={tokens.length}>
        <ContractFilter
          key={id}
          id={id}
          value={contract}
          onChange={(next) => {
            change({ txcontract: next })
          }}
        />
        <TransitionFilterFields value={shared} onChange={change} />
      </FilterPanel>
      {active ? (
        <>
          <ActiveFilters
            matches={
              contract
                ? done && !list.before.has
                  ? list.rows.length
                  : undefined
                : (list.total ?? list.rows.length)
            }
            tokens={tokens}
            onRemove={(tok) => {
              change(tok === 'contract' ? { txcontract: undefined } : base.removal(tok))
            }}
            onClear={() => {
              change({ ...NO_TRANSITION_FILTERS, txcontract: undefined })
            }}
          />
          <div className="grid gap-1 py-2 text-ink-2 text-sm" data-filter-note>
            <p className="m-0">{t`Filtered, the list shows the transitions this identity signed; credit it received is on the Transfers tab.`}</p>
            {contract ? (
              <p className="m-0">{t`Platform Explorer can’t filter by contract, so Radar reads 100 transitions at a time and keeps the ones on this contract.`}</p>
            ) : null}
          </div>
        </>
      ) : null}
      {matchesNothing ? (
        <Empty kind="no-match" title={t`None of the chosen types can act on a contract.`} />
      ) : (
        <ScrollList chain={list} position={pagePosition}>
          <TransitionTable
            rows={list.rows}
            state={list.state}
            error={list.error}
            onRetry={list.onRetry}
            caption={t`Transitions`}
            columns={['type', 'hash', 'status', 'block', 'gas', 'time']}
            paging={contract ? { ...list.paging, stalledLabel: t`Look further back` } : list.paging}
            empty={
              active ? (
                <Empty
                  kind="no-match"
                  title={
                    contract && !done
                      ? plural(reached, {
                          one: 'No match in this identity’s latest transition',
                          other: 'No match in this identity’s latest # transitions',
                        })
                      : t`No transition from this identity matches these filters`
                  }
                  action={
                    contract && !done ? (
                      <button type="button" className="dh-btn dh-btn--sm" onClick={list.readOn}>
                        {t`Look further back`}
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <Empty kind="none-yet" title={t`This identity has sent no transitions.`} />
              )
            }
          />
        </ScrollList>
      )}
    </Card>
  )
}
