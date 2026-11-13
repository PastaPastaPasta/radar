import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { sdkQueries } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'
import { Card, Empty, ErrorState, Skeleton } from '@/ui'
import { POSITION_OPERATORS, typeHelp, type TypeHelp } from './schema'

export interface SchemaPanelProps {
  net: NetworkId
  contractId: string
  /** Replaces the editor's text with a starting query on a type. */
  onUseType: (type: string) => void
}

/** The contract's document types, their indexes and the operators each index position allows. */
export function SchemaPanel({ net, contractId, onUseType }: SchemaPanelProps) {
  const { t } = useLingui()
  const query = useQuery(sdkQueries['contracts.fetch'](net, { id: contractId }))
  const types = query.data?.data ? typeHelp(query.data.data) : []

  return (
    <Card
      title={t`Schema`}
      layer="platform"
      source={query.data}
      state={query.isPending ? 'loading' : 'ready'}
      id="query-schema"
    >
      {query.isPending ? <Skeleton shape="row" count={3} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          source="sdk"
          onRetry={() => {
            void query.refetch()
          }}
        />
      ) : null}
      {query.data && !query.data.data ? (
        <Empty
          kind="not-found"
          title={t`No contract with this ID on this network.`}
          body={t`Check the ID, or pick one of the contracts in the list.`}
        />
      ) : null}
      {types.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`A filter follows one index: the fields it names must be an index's leading fields, matched with == or IN, and the last of them may take a range (<, <=, >, >=, BETWEEN) or STARTS WITH. Add ORDER BY for each field you filter with a range or IN.`}
          </p>
          <ul className="grid gap-2">
            {types.map((type) => (
              <TypeRow key={type.name} type={type} onUse={onUseType} />
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}

function TypeRow({ type, onUse }: { type: TypeHelp; onUse: (type: string) => void }) {
  const { t } = useLingui()
  return (
    <li
      data-schema-type={type.name}
      className="rounded-[var(--dh-r2)] border border-[var(--dh-line)]"
    >
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-2">
          <strong className="rx-mono">{type.name}</strong>
          <span className="text-sm text-[var(--dh-ink-2)]">
            {t`${type.fields.length} fields, ${type.indexes.length} indexes`}
          </span>
        </summary>
        <div className="grid gap-3 p-3 pt-1">
          <div>
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                onUse(type.name)
              }}
            >
              {t`Start a query on ${type.name}`}
            </button>
          </div>
          <div>
            <h3 className="font-semibold">{t`Fields`}</h3>
            <ul className="mt-1 grid gap-1 text-sm">
              {type.fields.map((f) => (
                <li key={f.name} className="flex flex-wrap gap-x-2">
                  <code className="rx-mono">{f.name}</code>
                  {f.type ? <span className="text-[var(--dh-ink-2)]">{f.type}</span> : null}
                  {f.indexed.length > 0 ? (
                    <span className="text-[var(--dh-ink-2)]">
                      {t`indexed`}:{' '}
                      {f.indexed.map((ix) => `${ix.index} #${ix.position}`).join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">{t`Indexes`}</h3>
            {type.indexes.length === 0 ? (
              <p className="text-sm text-[var(--dh-ink-2)]">
                {t`No indexes: documents of this type can only be read by their ID.`}
              </p>
            ) : (
              <ul className="mt-1 grid gap-2 text-sm">
                {type.indexes.map((ix) => (
                  <li key={ix.name} data-schema-index={ix.name}>
                    <p>
                      <code className="rx-mono">{ix.name}</code>
                      {ix.unique ? ` · ${t`unique`}` : ''}
                      {ix.contested ? ` · ${t`contested`}` : ''}
                    </p>
                    <ol className="mt-1 grid gap-0.5 pl-5">
                      {ix.fields.map((field, i) => (
                        <li key={field} className="list-decimal">
                          <code className="rx-mono">{field}</code>{' '}
                          <span className="text-[var(--dh-ink-2)]" data-position={i + 1}>
                            {[...POSITION_OPERATORS.equal, ...POSITION_OPERATORS.in].join(' ')}
                            {' · '}
                            {t`or, as the last field you filter`}{' '}
                            {[...POSITION_OPERATORS.range, ...POSITION_OPERATORS.prefix].join(' ')}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </li>
  )
}
