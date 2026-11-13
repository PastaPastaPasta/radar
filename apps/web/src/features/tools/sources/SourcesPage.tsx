import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { PageLink, networkName, useDocumentTitle, useNetwork } from '@/features/entity'
import type { DevnetConfig } from '@/lib/network'
import { Badge, Card, SourceModeSwitch, useSourceMode } from '@/ui'
import { EVONODES, backends, type Backend, type BackendId } from './backends'

const PE_API_DOCS =
  'https://github.com/pshenmic/platform-explorer/blob/master/packages/api/README.md'

interface Words {
  name: string
  use: string
  /** A reference for the backend, on a line of its own. */
  more?: ReactNode
}

function useWords(): Record<BackendId, Words> {
  const { t } = useLingui()
  return {
    dapi: {
      name: 'DAPI',
      use: t`Core's tip, blocks, transactions, ChainLocks and live feeds. Radar spreads its requests over many nodes and checks each block against its header.`,
    },
    sdk: {
      name: t`Platform SDK`,
      use: t`Platform's state, each answer with a proof that Radar checks in this browser.`,
    },
    quorums: {
      name: t`Node list and quorum keys`,
      use: t`Which evonodes exist, read about once an hour (a saved list or the built-in one stands in when it can't be read), and the quorum public keys the SDK checks proofs against. Decentralized only mode still uses it: without it Radar could not find nodes or check a proof.`,
    },
    hyphen: {
      name: 'Hyphen',
      use: t`Address balances and history, spent outputs, the rich list, charts, the mempool, governance and network internals.`,
    },
    insight: {
      name: 'Insight',
      use: t`Address, spent-output and governance reads while Hyphen's index is behind the chain.`,
    },
    pe: {
      name: 'Platform Explorer',
      use: t`Indexed Platform lists and search, and Platform's height until the SDK has answered.`,
      more: (
        <a href={PE_API_DOCS} target="_blank" rel="noreferrer">
          {t`Platform Explorer's API documentation`}
        </a>
      ),
    },
    rate: {
      name: t`Price feed`,
      use: t`The USD rate shown next to DASH amounts. Mainnet only.`,
    },
    radar: {
      name: t`Radar census API`,
      use: t`The masternode and node census, the map and client versions, from Radar's crawler.`,
      more: <PageLink to="/api">{t`Radar API`}</PageLink>,
    },
    site: {
      name: t`This site`,
      use: t`Radar's own code, the dashhq header, fonts and the map's shapes. It also sees which page you open directly or reload. For a link with ?sources=decentralized, its link previews ask no hosted backend either.`,
    },
  }
}

function BackendRow({ backend, words }: { backend: Backend; words: Words }) {
  const { t } = useLingui()
  const net = networkName(useNetwork())
  const host =
    backend.host === EVONODES ? (
      t`Evonodes from the node list, as https://address:port`
    ) : backend.host === null ? null : (
      <code className="break-all">{backend.host}</code>
    )
  return (
    <li
      data-backend={backend.id}
      data-hosted={String(backend.hosted)}
      data-state={backend.state}
      className="grid gap-1 border-b border-[var(--dh-line)] py-3 last:border-b-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-x-6"
    >
      <div className="grid content-start gap-1.5">
        <strong>{words.name}</strong>
        <p className="flex flex-wrap gap-1.5">
          <Badge size="sm" tone={backend.hosted ? 'neutral' : 'success'}>
            {backend.hosted ? t`Hosted by one operator` : t`Decentralized`}
          </Badge>
          <Badge
            size="sm"
            tone={
              backend.state === 'in-use' ? 'info' : backend.state === 'off' ? 'warning' : 'neutral'
            }
          >
            {backend.state === 'in-use'
              ? t`In use`
              : backend.state === 'off'
                ? t`Off in this mode`
                : t`Not on ${net}`}
          </Badge>
        </p>
      </div>
      <div className="grid content-start gap-1">
        {host ? (
          <p data-backend-host>
            {host}
            {backend.upstream ? (
              <span className="text-[var(--dh-ink-2)]">
                {' '}
                {t`(this site passes the request on to ${backend.upstream})`}
              </span>
            ) : null}
          </p>
        ) : null}
        <p className="text-[var(--dh-ink-2)]">{words.use}</p>
        {words.more ? <p>{words.more}</p> : null}
      </div>
    </li>
  )
}

export function SourcesPage({ devnets }: { devnets?: readonly DevnetConfig[] }) {
  const { t } = useLingui()
  const net = useNetwork()
  const mode = useSourceMode()
  const words = useWords()
  const network = networkName(net)
  const rows = backends(net, {
    origin: location.origin,
    decentralizedOnly: mode.mode === 'decentralized',
    devnets,
  })

  useDocumentTitle(t`Data sources`)

  return (
    <article data-page="/sources" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`Tools`}
        </p>
        <h1 className="text-3xl font-semibold">{t`Data sources`}</h1>
        <p className="max-w-2xl text-[var(--dh-ink-2)]">
          {t`Every backend Radar can contact, who runs it and whether it is in use on ${network}. Each figure in Radar names the one it came from.`}
        </p>
      </header>

      <Card id="mode" title={t`Which sources Radar may use`}>
        <div className="grid gap-2">
          <SourceModeSwitch />
          <p className="max-w-2xl text-[var(--dh-ink-2)]">
            {mode.fromLink && mode.remembered === 'all'
              ? t`The link you followed turned Decentralized only on for this visit. Choosing it here keeps it on in this browser.`
              : t`The choice stays in this browser. A link ending in ?sources=decentralized turns the mode on for one visit.`}
          </p>
        </div>
      </Card>

      <Card
        id="backends"
        title={t`Backends`}
        subtitle={t`Where requests go on ${network}, and what each one is for.`}
      >
        <ul className="grid gap-0" aria-label={t`Backends`}>
          {rows.map((b) => (
            <BackendRow key={b.id} backend={b} words={words[b.id]} />
          ))}
        </ul>
      </Card>

      <p className="text-[var(--dh-ink-2)]">
        <PageLink to="/status" className="rx-go whitespace-normal">
          {t`Status: how each source is answering right now`}
        </PageLink>
      </p>
    </article>
  )
}
