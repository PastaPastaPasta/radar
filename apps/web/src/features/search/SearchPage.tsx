import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ENTITY_LABELS, PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { isDevnet, type NetworkId } from '@/lib/network'
import { Badge, Card, Empty, ErrorState, Skeleton } from '@/ui'
import { describeInput } from './describe'
import { GROUP_LABELS, groupHits } from './groups'
import { useSearch } from './useSearch'

const EXAMPLES = ['2569992', 'pshenmic.dash', '75.119.128.71', '2026-10-01']

function otherNetwork(net: NetworkId): NetworkId {
  return net === 'mainnet' ? 'testnet' : 'mainnet'
}

function networkName(net: NetworkId): string {
  if (net === 'mainnet') return 'Mainnet'
  if (net === 'testnet') return 'Testnet'
  return net
}

export function SearchPage({ q }: { q?: string }) {
  const net = useNetwork()
  const navigate = useNavigate()
  const query = (q ?? '').trim()
  const [draft, setDraft] = useState(query)
  const { hits, pending, failed, classified } = useSearch(query, { mode: 'page' })
  const secret = classified.warning === 'secret'
  useDocumentTitle(query && !secret ? `“${query}” · Search` : 'Search')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void navigate({ to: '/search', search: { q: draft.trim() || undefined } })
  }

  const groups = groupHits(hits)
  const description = describeInput(classified)
  const settled = pending.length === 0
  const portable = classified.classes.some((k) => !['core-address', 'platform-address'].includes(k))

  return (
    <div className="grid gap-6" data-page="/search">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold">Search</h1>
        <form role="search" onSubmit={submit} className="flex gap-2">
          <label className="grow">
            <span className="sr-only">Search Radar</span>
            <input
              type="search"
              name="q"
              value={secret ? '' : draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Height, hash, address, ProTx, IP, ID, name…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded px-4 py-2 font-medium">
            Search
          </button>
        </form>
      </header>

      {secret ? (
        <Empty
          kind="blocked"
          title="That looks like a private key or recovery phrase"
          body="Radar never needs one, so it wasn’t searched or sent anywhere. Clear the search box before sharing this page."
        />
      ) : null}

      {!secret && query.length === 0 ? (
        <Card title="What you can search for">
          <ul className="grid gap-1">
            <li>Core block heights and hashes, transaction IDs and addresses</li>
            <li>Masternodes by ProTx hash or IP address</li>
            <li>Platform blocks, state transitions and Platform addresses</li>
            <li>
              Identities, contracts, tokens and documents by ID, or an identity by its public-key
              hash
            </li>
            <li>Names ending in .dash, epochs and dates (the Core blocks of a day)</li>
          </ul>
          <p className="mt-3 text-sm text-[var(--dh-ink-2,inherit)]">
            Try{' '}
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
        <section aria-label="Results" className="grid gap-4" aria-busy={!settled}>
          <p data-classified role="status" className="text-sm text-[var(--dh-ink-2,inherit)]">
            {description.length > 0
              ? `“${query}” looks like ${description.join(' · ')}.`
              : `“${query}” isn’t something Radar can look up.`}
          </p>

          {groups.map(([group, items]) => (
            <Card key={group} title={GROUP_LABELS[group]} layer={group}>
              <ul className="grid gap-2">
                {items.map((hit) => (
                  <li
                    key={`${hit.kind}:${hit.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link {...hit.href} className="min-w-0">
                      <span className="block truncate">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="block truncate text-sm text-[var(--dh-ink-2,inherit)]">
                          {hit.subtitle}
                        </span>
                      ) : null}
                    </Link>
                    <Badge size="sm">{ENTITY_LABELS[hit.kind]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {!settled ? <Skeleton shape="row" count={2} /> : null}

          {failed.map((f) => (
            <ErrorState key={f.id} error={f.error} source={f.error.source} compact />
          ))}

          {settled && hits.length === 0 ? (
            <Empty
              kind="no-match"
              title={`Nothing found for “${query}” on ${networkName(net)}`}
              body={
                description.length > 0
                  ? 'Radar checked every source that can answer this kind of input.'
                  : 'Try a height, a hash, an address, an ID or a name.'
              }
              action={
                portable && !isDevnet(net) && description.length > 0 ? (
                  <PageLink to="/search" search={{ q: query, network: otherNetwork(net) }}>
                    Search {networkName(otherNetwork(net))}
                  </PageLink>
                ) : undefined
              }
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
