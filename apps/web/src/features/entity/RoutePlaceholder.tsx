import type { ReactNode } from 'react'
import { Card, Empty, Hash, KeyValue } from '@/ui'
import type { SourceId } from '@/data/envelope'
import { isDevnet } from '@/lib/network'
import { useDocumentTitle } from './document-title'
import { useNetwork } from './network'
import { PageLink } from './PageLink'
import { findPage, SECTION_LABELS, SOURCE_LABELS } from './site-map'

const DEVNET_SOURCES = new Set<SourceId>(['sdk', 'dapi', 'local'])

const SOURCE_NAMES: Record<SourceId, string> = {
  sdk: 'The Platform SDK',
  dapi: 'DAPI',
  radar: 'Radar’s crawl',
  pe: 'Platform Explorer',
  hyphen: 'Hyphen',
  rate: 'The price feed',
  local: 'This browser',
}

function listSources(sources: SourceId[]): string {
  const names = sources.map((s) => SOURCE_LABELS[s])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

export interface RoutePlaceholderProps {
  /** The route id pattern in the site map, e.g. `/block/$id`. */
  path: string
  /** Route params as the URL has them, shown as the record this page is about. */
  params?: Record<string, string>
  /** Replaces the page title as the h1. */
  heading?: string
  children?: ReactNode
}

const PARAM_LABELS: Record<string, string> = {
  id: 'ID',
  txid: 'Transaction ID',
  address: 'Address',
  hash: 'Hash',
  protx: 'ProTx hash',
  n: 'Number',
  label: 'Name',
  contract: 'Contract',
  type: 'Type',
  pos: 'Position',
  addr: 'Address',
  decoder: 'Decoder',
}

export function RoutePlaceholder({ path, params, heading, children }: RoutePlaceholderProps) {
  const net = useNetwork()
  const page = findPage(path)
  const title = heading ?? page?.title ?? 'Radar'
  useDocumentTitle(title)
  if (!page) return null

  const unsupported = isDevnet(net) ? page.sources.find((s) => !DEVNET_SOURCES.has(s)) : undefined
  const onlyUnsupported = isDevnet(net) && page.sources.every((s) => !DEVNET_SOURCES.has(s))
  const entries = Object.entries(params ?? {})

  return (
    <article data-page={page.path} data-layer={page.layer} className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm opacity-70">
          {SECTION_LABELS[page.section]}
          {net === 'mainnet' ? null : ` · ${net === 'testnet' ? 'Testnet' : net}`}
        </p>
        <h1 className="text-3xl font-semibold">{heading ?? page.title}</h1>
        {entries.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="text-sm opacity-70">{PARAM_LABELS[key] ?? key}</dt>
                <dd>
                  <Hash value={value} display="short" head={10} tail={6} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {onlyUnsupported && unsupported ? (
        <Empty
          kind="unsupported-network"
          title={`${SOURCE_NAMES[unsupported]} doesn’t cover devnets.`}
          body={`This page reads from ${listSources(page.sources)}. Switch to Mainnet or Testnet to see it.`}
          action={
            <PageLink to="/" search={{ network: 'mainnet' }}>
              Back to Mainnet
            </PageLink>
          }
        />
      ) : (
        <Empty
          kind="none-yet"
          title="This page is on its way"
          body={page.summary}
          action={children}
        />
      )}

      <Card title="Where the data comes from" layer={page.layer}>
        <KeyValue
          columns={2}
          items={[
            { label: 'Read from', value: listSources(page.sources) },
            {
              label: 'Network',
              value: net === 'mainnet' ? 'Mainnet' : net === 'testnet' ? 'Testnet' : net,
            },
          ]}
        />
      </Card>
    </article>
  )
}
