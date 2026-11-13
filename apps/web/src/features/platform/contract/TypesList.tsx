import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { ContractFullDto } from '@/data/sdk/methods'
import { formatInt } from '@/lib/format'
import { Badge, Empty } from '@/ui'
import { propertyNames, typeKeepsHistory, typeNames } from './contract-data'

export interface TypesListProps {
  id: string
  contract: ContractFullDto
  /** Draws each type's indices, not just their count. */
  expanded: boolean
}

function IndexTable({
  id,
  type,
  contract,
}: {
  id: string
  type: string
  contract: ContractFullDto
}) {
  const { t } = useLingui()
  const indices = contract.indices[type] ?? []
  if (indices.length === 0) {
    return <p className="text-ink-2">{t`No indices: documents can be fetched by ID only.`}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="rx-table w-full" aria-label={t`Indices of ${type}`} data-indices={id}>
        <thead>
          <tr>
            <th scope="col">{t`Index`}</th>
            <th scope="col">{t`Properties, in order`}</th>
            <th scope="col">{t`Kind`}</th>
          </tr>
        </thead>
        <tbody>
          {indices.map((index) => (
            <tr key={index.name}>
              <th scope="row" className="font-mono">
                {index.name}
              </th>
              <td className="font-mono">
                {index.properties
                  .map((p) => `${p.field}${p.order === 'desc' ? ' ↓' : ''}`)
                  .join(', ')}
              </td>
              <td className="flex flex-wrap gap-1">
                {index.unique ? <Badge size="sm">{t`Unique`}</Badge> : null}
                {index.contested ? <Badge size="sm" tone="warning">{t`Contested`}</Badge> : null}
                {!index.unique && !index.contested ? '—' : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Each document type of a contract, with its indices and the way into its documents browser. */
export function TypesList({ id, contract, expanded }: TypesListProps) {
  const { t } = useLingui()
  const names = typeNames(contract)
  if (names.length === 0) {
    return (
      <Empty
        kind="none-yet"
        title={t`This contract has no document types.`}
        body={t`A contract can hold only tokens or groups.`}
      />
    )
  }
  return (
    <ul className="grid gap-4" data-types>
      {names.map((type) => {
        const props = formatInt(propertyNames(contract.documentSchemas[type]).length)
        const indices = formatInt(contract.indices[type]?.length ?? 0)
        return (
          <li key={type} className="grid gap-2" data-type={type}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-mono text-lg font-semibold">{type}</h4>
              <div className="flex flex-wrap items-center gap-2">
                {typeKeepsHistory(contract, type) ? (
                  <Badge size="sm" tone="info">
                    {t`Keeps history`}
                  </Badge>
                ) : null}
                <span className="text-ink-2">{t`${props} properties · ${indices} indices`}</span>
                <Link
                  className="dh-btn dh-btn--sm"
                  to="/contract/$id/documents/$type"
                  params={{ id, type }}
                  data-browse-documents={type}
                >
                  {t`Browse documents`}
                </Link>
              </div>
            </div>
            {expanded ? <IndexTable id={id} type={type} contract={contract} /> : null}
          </li>
        )
      })}
    </ul>
  )
}
