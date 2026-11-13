import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { entityLabel, PageLink, networkName, useDocumentTitle, useNetwork } from '@/features/entity'
import { isDevnet, type NetworkId } from '@/lib/network'
import { Badge, Card, Empty, ErrorState, Skeleton, Unavailable } from '@/ui'
import { classify, type SecretWarning } from './classify'
import { describeInput, secretNotice } from './describe'
import { groupHits, groupLabel } from './groups'
import type { SearchHit } from './types'
import { useSearch } from './useSearch'
import { useWordlistLoaded } from './wordlist'

const EXAMPLES = ['2569992', 'pshenmic.dash', '75.119.128.71', '2026-10-01']

function otherNetwork(net: NetworkId): NetworkId {
  return net === 'mainnet' ? 'testnet' : 'mainnet'
}

function withheldFrom(state: unknown): SecretWarning | undefined {
  const value = (state as { withheld?: unknown } | undefined)?.withheld
  return value === 'secret' || value === 'possible-secret' ? value : undefined
}

function HitList({ hits, badge }: { hits: SearchHit[]; badge: (hit: SearchHit) => string }) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {hits.map((hit) => (
        <li key={`${hit.kind}:${hit.id}`} className="flex items-center justify-between gap-3">
          <Link {...hit.href} className="min-w-0">
            <span className="block truncate">{hit.title}</span>
            {hit.subtitle ? (
              <span className="block truncate text-sm text-[var(--dh-ink-2,inherit)]">
                {hit.subtitle}
              </span>
            ) : null}
          </Link>
          <Badge size="sm">{badge(hit)}</Badge>
        </li>
      ))}
    </ul>
  )
}

export function SearchPage({ q }: { q?: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const query = (q ?? '').trim()
  const [draft, setDraft] = useState(() => (classify(query, net).warning ? '' : query))
  const { hits, pending, failed, skipped, classified } = useSearch(query, { mode: 'page' })
  const secret = classified.warning
  const wordsReady = useWordlistLoaded()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the wordlist arriving changes the answer
  const typed = useMemo(() => classify(draft.trim(), net).warning, [draft, net, wordsReady])
  const stripped = useRouterState({ select: (s) => withheldFrom(s.location.state) })
  const withheld = typed ?? secret ?? stripped
  useDocumentTitle(query && !secret ? t`“${query}” · Search` : t`Search`)

  useEffect(() => {
    if (!secret) return
    void navigate({
      to: '/search',
      search: (prev) => ({ ...prev, q: undefined }),
      replace: true,
      state: (prev) => ({ ...prev, withheld: secret }),
    })
  }, [secret, navigate])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (typed) return
    void navigate({ to: '/search', search: { q: draft.trim() || undefined } })
  }

  const { groups, guesses } = groupHits(hits)
  const settled = pending.length === 0
  const noMatch = settled && groups.length === 0
  const description = describeInput({
    ...classified,
    classes: noMatch ? classified.classes.filter((k) => k !== 'dpns') : classified.classes,
  })
  const network = networkName(net)
  const portable = classified.classes.some((k) => !['core-address', 'platform-address'].includes(k))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-page="/search">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold">{t`Search`}</h1>
        <form role="search" onSubmit={submit} className="flex gap-2">
          <label className="min-w-0 grow">
            <span className="sr-only">{t`Search Radar`}</span>
            <input
              type="search"
              name="q"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t`Height, hash, address, ProTx, IP, ID, name…`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full min-w-0 rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded px-4 py-2 font-medium">
            {t`Search`}
          </button>
        </form>
      </header>

      {withheld ? (
        <Empty
          kind="blocked"
          title={secretNotice(withheld).title}
          body={secretNotice(withheld).body}
        />
      ) : null}

      {!secret && query.length === 0 ? (
        <Card title={t`What you can search for`}>
          <ul className="grid gap-1">
            <li>{t`Core block heights and hashes, transaction IDs and addresses`}</li>
            <li>{t`Masternodes by ProTx hash or IP address`}</li>
            <li>{t`Platform blocks, state transitions and Platform addresses`}</li>
            <li>
              {t`Identities, contracts, tokens and documents by ID, or an identity by its public-key hash`}
            </li>
            <li>{t`Names ending in .dash, epochs and dates (the Core blocks of a day)`}</li>
          </ul>
          <p className="mt-3 text-sm text-[var(--dh-ink-2,inherit)]">
            {t`Try`}{' '}
            {EXAMPLES.map((example, i) => (
              <span key={example}>
                {i > 0 ? ', ' : ''}
                <Link to="/search" search={{ q: example }}>
                  {example}
                </Link>
              </span>
            ))}
          </p>
        </Card>
      ) : null}

      {!secret && query.length > 0 ? (
        <section
          aria-label={t`Results`}
          className="grid grid-cols-[minmax(0,1fr)] gap-4"
          aria-busy={!settled}
        >
          {classified.classes.length === 0 ? (
            <p data-classified role="status" className="text-sm text-[var(--dh-ink-2,inherit)]">
              {t`“${query}” isn’t something Radar can look up.`}
            </p>
          ) : null}
          {description.length > 0 ? (
            <p data-classified role="status" className="text-sm text-[var(--dh-ink-2,inherit)]">
              {t`“${query}” looks like ${description.join(' · ')}.`}
            </p>
          ) : null}

          {groups.map(([group, items]) => (
            <Card key={group} title={groupLabel(group)} layer={group}>
              <HitList hits={items} badge={(hit) => entityLabel(hit.kind)} />
            </Card>
          ))}

          {!settled ? <Skeleton shape="row" count={2} /> : null}

          {failed.map((f) => (
            <ErrorState key={f.id} error={f.error} source={f.error.source} compact />
          ))}

          {skipped.length > 0 ? (
            <Unavailable
              compact
              title={t`Lookups in an index were skipped, so some matches may be missing`}
            />
          ) : null}

          {noMatch ? (
            <Empty
              kind="no-match"
              title={t`No match for “${query}” as a Core record on ${network}`}
              body={
                description.length > 0
                  ? t`Radar checked every source that can answer this kind of input.`
                  : t`Radar found no block, transaction, address, masternode or other record for this. Try a height, a hash, an address, an ID or a name.`
              }
              action={
                portable && !isDevnet(net) && description.length > 0 ? (
                  <PageLink to="/search" search={{ q: query, network: otherNetwork(net) }}>
                    {t`Search ${networkName(otherNetwork(net))}`}
                  </PageLink>
                ) : undefined
              }
            />
          ) : null}

          {settled && guesses.length > 0 ? (
            <section
              aria-label={t`A guess`}
              data-guess
              className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded border border-dashed p-4"
            >
              <h2 className="text-sm font-medium text-[var(--dh-ink-2,inherit)]">
                {t`A guess, not a result`}
              </h2>
              <p className="text-sm text-[var(--dh-ink-2,inherit)]">
                {t`Nothing above confirms this. It is only one way to read what you typed.`}
              </p>
              <HitList hits={guesses} badge={() => t`Guess`} />
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
