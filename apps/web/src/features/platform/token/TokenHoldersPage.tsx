import { useLingui } from '@lingui/react/macro'
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { sdkBatchers } from '@/data/sdk/queries'
import {
  IdentityRef,
  PageFrame,
  PageLink,
  useNetwork,
  useViewedEnabled,
  useViewedIdentities,
} from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { wellKnownIdentities } from '@/lib/well-known'
import { Amount, Card, DataTable, Empty, LinkOut } from '@/ui'
import { pageTo } from '../identity/common'
import { resolveIdentityText } from './identity-input'
import { tokenAmountKind, useToken, type TokenView } from './use-token'

/** Identities shown on one page: one `tokens.balances` call holds all of them. */
const HOLDERS_PAGE = 25
const MAX_IDS = 100

export interface TokenHoldersSearch {
  ids?: string[] | undefined
  page: number
}

export function TokenHoldersPage({ id, search }: { id: string; search: TokenHoldersSearch }) {
  const { t } = useLingui()
  const token = useToken(id)
  const { net } = token
  const ids = useMemo(() => search.ids ?? [], [search.ids])
  const decentralized = useDecentralizedOnly()
  return (
    <PageFrame
      path="/token/$id/holders"
      title={t`Token holders`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Balances of the identities you choose. Platform keeps no list of a token’s holders, so this asks the node about each one.`}
      share
    >
      {!token.valid ? (
        <Empty kind="not-found" title={t`That isn’t a token ID.`} />
      ) : token.missing ? (
        <Empty
          kind="not-found"
          title={t`No token with this ID on ${net}.`}
          action={<PageLink to="/tokens">{t`Open a token by contract and position`}</PageLink>}
        />
      ) : (
        <div className="grid gap-6">
          <TokenLine token={token} />
          <AddForm ids={ids} />
          <HoldersTable token={token} ids={ids} page={search.page} />
          {decentralized ? null : (
            <p data-holder-index-note>
              {t`Platform has no holder index, so Radar cannot list every holder. Platform Explorer keeps one: `}
              <LinkOut to={{ app: 'pe', path: `/token/${token.id}`, net: token.net }}>
                {t`See the holder list on Platform Explorer`}
              </LinkOut>
            </p>
          )}
        </div>
      )}
    </PageFrame>
  )
}

function TokenLine({ token }: { token: TokenView }) {
  const { t } = useLingui()
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span>{t`Token`}</span>
      <PageLink to={`/token/${token.id}`}>
        {token.name?.singular ?? token.symbol ?? token.id}
      </PageLink>
    </p>
  )
}

function AddForm({ ids }: { ids: string[] }) {
  const { t } = useLingui()
  const net = useNetwork()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const viewedOn = useViewedEnabled()
  const viewed = useViewedIdentities(net)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)

  const setIds = (next: string[], replace: boolean) =>
    void navigate({
      to: '.',
      replace,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        ids: next.length > 0 ? next : undefined,
        page: undefined,
      })) as never,
    })
  const add = (more: string[]) => {
    const merged = [...new Set([...ids, ...more])].slice(0, MAX_IDS)
    if (merged.length > ids.length) setIds(merged, false)
  }

  const submit = async () => {
    const parts = draft
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter((p) => p !== '')
    if (parts.length === 0) return
    setBusy(true)
    const found: string[] = []
    const problems: string[] = []
    for (const part of parts) {
      const r = await resolveIdentityText(qc, net, part)
      if (r.ok) found.push(r.id)
      else if (r.reason === 'invalid')
        problems.push(t`“${part}” is neither an identity ID nor a name.`)
      else {
        const name = r.name ?? part
        problems.push(
          r.reason === 'not-found'
            ? t`No identity has the name ${name}.`
            : t`The name ${name} could not be looked up.`,
        )
      }
    }
    setBusy(false)
    setProblem(problems.length > 0 ? problems.join(' ') : undefined)
    if (found.length > 0) {
      add(found)
      if (problems.length === 0) setDraft('')
    }
  }

  const known = wellKnownIdentities(net).filter((k) => !ids.includes(k.id))
  const fresh = viewed.map((v) => v.id).filter((v) => !ids.includes(v))
  return (
    <Card title={t`Choose identities`} layer="platform" id="token-holders-form">
      <div className="grid gap-3" data-holders-form>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="grid gap-1">
            <span>{t`Identity IDs or names`}</span>
            <input
              className="dh-input dh-input--sm"
              style={{ width: 'min(100%, 28rem)' }}
              value={draft}
              spellCheck={false}
              autoComplete="off"
              placeholder={t`Separate several with spaces or commas`}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
            />
          </label>
          <button type="submit" className="dh-btn dh-btn--sm" disabled={busy}>
            {t`Add`}
          </button>
        </form>
        {problem ? (
          <p role="status" className="text-bad">
            {problem}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {viewedOn && fresh.length > 0 ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                add(fresh)
              }}
            >
              {t`Add the identities I viewed`}
            </button>
          ) : null}
          {known.map((k) => (
            <button
              key={k.id}
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                add([k.id])
              }}
            >
              {t`Add ${k.name}`}
            </button>
          ))}
          {ids.length > 0 ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                setIds([], false)
              }}
            >
              {t`Clear`}
            </button>
          ) : null}
        </div>
        {!viewedOn ? (
          <p className="text-ink-2 text-sm [&_a]:underline">
            {t`Radar can remember the identities you open in this browser, and add them here. That is off until you turn it on in Settings.`}{' '}
            <PageLink to="/settings">{t`Open Settings`}</PageLink>
          </p>
        ) : null}
      </div>
    </Card>
  )
}

interface HolderRow {
  id: string
  balance: UseQueryResult<Sourced<bigint | null>>
}

function BalanceCell({ token, row }: { token: TokenView; row: HolderRow }) {
  const { t } = useLingui()
  const q = row.balance
  const kind = tokenAmountKind(token)
  if (q.isPending) return <span aria-busy="true">…</span>
  if (q.isError && q.data === undefined) {
    return (
      <span data-balance-state="unknown" title={t`The node did not answer for this identity.`}>
        {t`Unknown`}{' '}
        <button
          type="button"
          className="dh-btn dh-btn--sm rx-cellbtn"
          onClick={() => void q.refetch()}
        >
          {t`Try again`}
        </button>
      </span>
    )
  }
  if (!kind) return <>—</>
  return (
    <span data-balance-state={q.data?.data === null ? 'none' : 'known'}>
      <Amount value={q.data?.data ?? 0n} kind={kind} />
    </span>
  )
}

function HoldersTable({ token, ids, page }: { token: TokenView; ids: string[]; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const lastPage = Math.max(1, Math.ceil(ids.length / HOLDERS_PAGE))
  const current = Math.min(page, lastPage)
  const shown = ids.slice((current - 1) * HOLDERS_PAGE, current * HOLDERS_PAGE)

  const balances = useQueries({
    queries: shown.map((identityId) => ({
      ...sdkBatchers.tokenBalance.queryOptions(net, { tokenId: token.id, identityId }),
      enabled: isPlatformId(identityId),
    })),
  })
  const rows: HolderRow[] = shown.map((id, i) => ({ id, balance: balances[i]! }))
  const stamps: SourceStamp[] = balances.flatMap((b) => (b.data ? [stampOf(b.data)] : []))

  const columns = useMemo<ColumnDef<HolderRow>[]>(
    () => [
      {
        id: 'identity',
        header: t`Identity`,
        cell: ({ row }) => <IdentityRef id={row.original.id} />,
        meta: { phone: 'title' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        cell: ({ row }) => <BalanceCell token={token} row={row.original} />,
        meta: { numeric: true, phone: 'primary' },
      },
      {
        id: 'remove',
        header: t`Remove`,
        cell: ({ row }) => {
          const id = row.original.id
          return (
            <button
              type="button"
              className="dh-btn dh-btn--sm rx-cellbtn"
              aria-label={t`Remove ${id} from the list`}
              onClick={() => {
                const rest = ids.filter((i) => i !== id)
                void navigate({
                  to: '.',
                  replace: true,
                  search: ((prev: Record<string, unknown>) => ({
                    ...prev,
                    ids: rest.length > 0 ? rest : undefined,
                  })) as never,
                })
              }}
            >
              {t`Remove`}
            </button>
          )
        },
        meta: { phone: 'secondary' },
      },
    ],
    [t, token, navigate, ids],
  )
  return (
    <Card
      title={t`Balances`}
      layer="platform"
      id="token-holders-table"
      source={stamps.length > 0 ? stamps : undefined}
    >
      <DataTable
        caption={t`Balances of the chosen identities`}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        state={ids.length === 0 ? 'empty' : 'ready'}
        paging={
          ids.length > HOLDERS_PAGE
            ? { kind: 'page', page: current, limit: HOLDERS_PAGE, total: ids.length, to: pageTo }
            : undefined
        }
        empty={
          <Empty
            kind="none-yet"
            title={t`No identities chosen yet`}
            body={t`Add identity IDs or DPNS names above to see their balances of this token.`}
          />
        }
      />
    </Card>
  )
}
