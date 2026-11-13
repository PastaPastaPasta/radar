import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  entityHref,
  entityLabel,
  PageFrame,
  PageLink,
  removeItem,
  useNetwork,
  useSaved,
  type SavedItem,
} from '@/features/entity'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import { announce, DataTable, Empty, EntityChip, networkName, SegFilter, Time } from '@/ui'

const KINDS = ['identity', 'contract', 'token'] as const satisfies readonly SavedItem['kind'][]
type Scope = 'network' | 'all'

const rowId = (s: SavedItem) => `${s.net}/${s.kind}/${s.id}`

function useSavedFilters(): { scope: Scope; kinds: readonly SavedItem['kind'][] } {
  const search = useSearch({
    strict: false,
    select: (s) => ({
      scope: (s as { scope?: unknown }).scope,
      kind: (s as { kind?: unknown }).kind,
    }),
  })
  const wanted: unknown[] = Array.isArray(search.kind) ? search.kind : []
  return {
    scope: search.scope === 'all' ? 'all' : 'network',
    kinds: KINDS.filter((k) => wanted.includes(k)),
  }
}

export function SavedPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const saved = useSaved()
  const { scope, kinds } = useSavedFilters()
  const [confirming, setConfirming] = useState(false)
  useSyncExternalStore(subscribeLabels, labelsVersion, labelsVersion)

  const inScope = useMemo(
    () => (scope === 'all' ? saved : saved.filter((s) => s.net === net)),
    [saved, scope, net],
  )
  const shown = useMemo(
    () => (kinds.length === 0 ? inScope : inScope.filter((s) => kinds.includes(s.kind))),
    [inScope, kinds],
  )
  const countOf = (k: SavedItem['kind']) => inScope.filter((s) => s.kind === k).length

  const update = (patch: { scope?: Scope; kind?: readonly string[] }) => {
    setConfirming(false)
    void navigate({
      to: '/saved',
      search: ((s: Record<string, unknown>) => ({
        ...s,
        ...('scope' in patch ? { scope: patch.scope } : {}),
        ...('kind' in patch ? { kind: patch.kind?.length ? [...patch.kind] : undefined } : {}),
      })) as never,
      replace: true,
    })
  }

  const columns = useMemo<ColumnDef<SavedItem>[]>(
    () => [
      {
        id: 'item',
        header: t`Saved item`,
        cell: ({ row }) => {
          const s = row.original
          return (
            <EntityChip
              kind={s.kind}
              id={s.id}
              label={s.label ?? wellKnownLabel(s.net, s.kind, s.id)}
              href={entityHref(s.kind, s.id, s.net)}
            />
          )
        },
        meta: { phone: 'title' },
      },
      {
        id: 'kind',
        header: t`Kind`,
        cell: ({ row }) => entityLabel(row.original.kind),
        meta: { phone: 'secondary' },
      },
      {
        id: 'network',
        header: t`Network`,
        cell: ({ row }) => networkName(row.original.net),
        meta: { phone: 'secondary' },
      },
      {
        id: 'saved',
        header: t`Saved`,
        cell: ({ row }) => <Time ms={row.original.savedAt} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'remove',
        header: () => <span className="sr-only">{t`Remove`}</span>,
        cell: ({ row }) => {
          const s = row.original
          const name = s.label ?? s.id
          return (
            <button
              type="button"
              className="dh-btn dh-btn--quiet dh-btn--sm"
              aria-label={t`Remove ${name} from saved`}
              onClick={() => {
                removeItem(s)
                announce(t`Removed from saved`)
              }}
            >
              {t`Remove`}
            </button>
          )
        },
        meta: { phone: 'secondary', align: 'end' },
      },
    ],
    [t],
  )

  const toggleKind = (k: SavedItem['kind']) => {
    update({ kind: kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k] })
  }

  const clearShown = () => {
    for (const s of shown) removeItem(s)
    setConfirming(false)
    announce(t`Saved items cleared`)
  }

  const none = saved.length === 0
  return (
    <PageFrame
      path="/saved"
      title={t`Saved`}
      eyebrow={t`You`}
      layer="neutral"
      lede={t`Identities, contracts and tokens you saved. They stay only in this browser, on this device: Radar has no accounts, so they don’t follow you to another browser, and clearing this site’s data removes them.`}
    >
      <div className="flex flex-wrap items-center gap-3" data-saved-filters>
        <SegFilter
          label={t`Networks`}
          value={scope}
          onChange={(v) => {
            update({ scope: v as Scope })
          }}
          options={[
            { id: 'network', label: t`This network` },
            { id: 'all', label: t`All networks` },
          ]}
        />
        <div className="dh-seg" role="group" aria-label={t`Kind`}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.includes(k)}
              onClick={() => {
                toggleKind(k)
              }}
            >
              {entityLabel(k)}
              <span className="dh-count"> {countOf(k)}</span>
            </button>
          ))}
        </div>
        <span className="ms-auto">
          {confirming ? (
            <span
              role="group"
              aria-label={t`Confirm clearing`}
              className="flex flex-wrap items-center gap-2"
            >
              <span>
                {plural(shown.length, {
                  one: 'Remove # saved item?',
                  other: 'Remove # saved items?',
                })}
              </span>
              <button
                type="button"
                className="dh-btn dh-btn--sm dh-btn--destructive"
                onClick={clearShown}
              >
                {t`Yes, remove`}
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--sm dh-btn--quiet"
                onClick={() => {
                  setConfirming(false)
                }}
              >
                {t`Cancel`}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="dh-btn dh-btn--sm dh-btn--destructive"
              disabled={shown.length === 0}
              onClick={() => {
                setConfirming(true)
              }}
            >
              {t`Clear shown`}
            </button>
          )}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        getRowId={rowId}
        state={shown.length === 0 ? 'empty' : 'ready'}
        caption={t`Saved items`}
        phone="cards"
        empty={
          none ? (
            <Empty
              kind="none-yet"
              title={t`Nothing saved yet`}
              body={t`Open an identity, a contract or a token and press Save. It appears here.`}
              action={
                <PageLink
                  to="/identities"
                  className="dh-btn dh-btn--sm"
                >{t`Browse identities`}</PageLink>
              }
            />
          ) : (
            <Empty
              kind="no-match"
              title={t`Nothing saved here`}
              body={
                scope === 'network'
                  ? t`Nothing matches on this network. Try All networks, or another kind.`
                  : t`Nothing matches this kind.`
              }
            />
          )
        }
      />
    </PageFrame>
  )
}
