import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { ReactNode } from 'react'
import { Card, Empty, Hash, KeyValue } from '@/ui'
import type { SourceId } from '@/data/envelope'
import { isDevnet } from '@/lib/network'
import { useDocumentTitle } from './document-title'
import { networkName, useNetwork } from './network'
import { PageLink } from './PageLink'
import { findPage, SECTION_LABELS, SOURCE_LABELS } from './site-map'

const DEVNET_SOURCES = new Set<SourceId>(['sdk', 'dapi', 'local'])

const SOURCE_NAMES: Record<SourceId, MessageDescriptor> = {
  sdk: msg`The Platform SDK`,
  dapi: msg`DAPI`,
  radar: msg`Radar’s crawl`,
  pe: msg`Platform Explorer`,
  hyphen: msg`Hyphen`,
  rate: msg`The price feed`,
  local: msg`This browser`,
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

const PARAM_LABELS: Record<string, MessageDescriptor> = {
  id: msg`ID`,
  txid: msg`Transaction ID`,
  address: msg`Address`,
  hash: msg`Hash`,
  protx: msg`ProTx hash`,
  n: msg`Number`,
  label: msg`Name`,
  contract: msg`Contract`,
  type: msg`Type`,
  pos: msg`Position`,
  addr: msg`Address`,
  decoder: msg`Decoder`,
}

export function RoutePlaceholder({ path, params, heading, children }: RoutePlaceholderProps) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const page = findPage(path)
  const title = heading ?? (page ? i18n._(page.title) : 'Radar')
  useDocumentTitle(title)
  if (!page) return null

  const listSources = (sources: SourceId[]) =>
    new Intl.ListFormat(i18n.locale, { style: 'long', type: 'conjunction' }).format(
      sources.map((s) => i18n._(SOURCE_LABELS[s])),
    )

  const unsupported = isDevnet(net) ? page.sources.find((s) => !DEVNET_SOURCES.has(s)) : undefined
  const onlyUnsupported = isDevnet(net) && page.sources.every((s) => !DEVNET_SOURCES.has(s))
  const entries = Object.entries(params ?? {})

  return (
    <article data-page={page.path} data-layer={page.layer} className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {i18n._(SECTION_LABELS[page.section])}
          {net === 'mainnet' ? null : ` · ${networkName(net)}`}
        </p>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {entries.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="text-sm text-[var(--dh-ink-2,inherit)]">
                  {PARAM_LABELS[key] ? i18n._(PARAM_LABELS[key]) : key}
                </dt>
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
          title={t`${i18n._(SOURCE_NAMES[unsupported])} doesn’t cover devnets.`}
          body={t`This page reads from ${listSources(page.sources)}. Switch to Mainnet or Testnet to see it.`}
          action={
            <PageLink to="/" search={{ network: 'mainnet' }}>
              {t`Back to Mainnet`}
            </PageLink>
          }
        />
      ) : (
        <Empty
          kind="none-yet"
          title={t`This page is on its way`}
          body={i18n._(page.summary)}
          action={children}
        />
      )}

      <Card title={t`Where the data comes from`} layer={page.layer}>
        <KeyValue
          columns={2}
          items={[
            { label: t`Read from`, value: listSources(page.sources) },
            { label: t`Network`, value: networkName(net) },
          ]}
        />
      </Card>
    </article>
  )
}
