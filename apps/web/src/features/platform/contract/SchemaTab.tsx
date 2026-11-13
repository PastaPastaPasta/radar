import { useLingui } from '@lingui/react/macro'
import { Link, type LinkProps } from '@tanstack/react-router'
import { Badge, Card, Empty, JsonView } from '@/ui'
import type { ContractContext } from './contract-context'
import { pathOfPointer, pointerOf, valueAt } from './version-diff'

function kindOf(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null

/** A link to the schema tab opened at `path`. */
export function schemaLink(id: string, path: readonly string[]): LinkProps {
  return {
    to: '/contract/$id',
    params: { id },
    search: (s: Record<string, unknown>) => ({
      ...s,
      tab: 'schema',
      path: path.length === 0 ? undefined : pointerOf(path),
    }),
  } as LinkProps
}

/** The contract's schemas as a tree you can walk: the address names the node that is open. */
export function SchemaTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { id, contract, stamp, search } = ctx
  const path = pathOfPointer(search.path)
  const node =
    path.length === 0 ? contract.documentSchemas : valueAt(contract.documentSchemas, path)
  const root = t`Schemas`

  if (node === undefined) {
    return (
      <Card title={t`Schema`} layer="platform" source={stamp}>
        <Empty
          kind="not-found"
          title={t`That path isn’t in this schema.`}
          body={<Link {...schemaLink(id, [])}>{t`Open the whole schema`}</Link>}
        />
      </Card>
    )
  }
  const children = isContainer(node) ? Object.entries(node).filter(([, v]) => isContainer(v)) : []
  return (
    <Card title={t`Schema`} layer="platform" source={stamp} id="schema">
      <div className="grid gap-4">
        <nav aria-label={t`Schema path`} data-schema-path>
          <ol className="flex flex-wrap items-center gap-1 font-mono">
            <li>
              {path.length === 0 ? (
                <span aria-current="location">{root}</span>
              ) : (
                <Link {...schemaLink(id, [])}>{root}</Link>
              )}
            </li>
            {path.map((part, i) => (
              <li key={`${i}:${part}`} className="flex items-center gap-1">
                <span aria-hidden>›</span>
                {i === path.length - 1 ? (
                  <span aria-current="location">{part}</span>
                ) : (
                  <Link {...schemaLink(id, path.slice(0, i + 1))}>{part}</Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {children.length > 0 ? (
          <ul
            className="flex flex-wrap gap-2"
            aria-label={t`Open a part of this schema`}
            data-schema-children
          >
            {children.map(([key, value]) => (
              <li key={key}>
                <Link className="dh-btn dh-btn--sm font-mono" {...schemaLink(id, [...path, key])}>
                  {key}
                  <Badge size="sm">{kindOf(value)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <JsonView value={node} collapsedDepth={path.length === 0 ? 1 : 2} label={t`Schema JSON`} />
      </div>
    </Card>
  )
}
