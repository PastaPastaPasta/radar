import { useLingui } from '@lingui/react/macro'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { PageFrame } from '@/features/entity'
import { announce, Copy, Icon } from '@/ui'
import { copyText } from '@/ui/clipboard'
import {
  API_ORIGIN,
  CURL_EXAMPLES,
  GLOBAL_ENDPOINTS,
  NETWORK_ENDPOINTS,
  endpointTitle,
  type ApiEndpoint,
} from './endpoints'

const COPIED_MS = 1400
const NET = '{net}'

export function ApiPage() {
  const { t } = useLingui()
  const hosted = useDecentralizedOnly()
  return (
    <PageFrame
      path="/api"
      title={t`Radar API`}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={t`Everything Radar shows comes from these JSON endpoints. No key is needed, CORS is open and responses are cached for 60 seconds.`}
    >
      <div className="grid min-w-0 gap-6">
        <div className="grid gap-2" data-api-intro>
          <p className="rx-note" data-api-unchanged>
            {t`The API URLs are unchanged: https://radar.dashhq.org/api/v1/* returns the same documents as before.`}
          </p>
          {hosted ? (
            <p className="rx-note" data-api-hosted>
              {t`The API itself is a hosted service, so this page only describes it while Decentralized only mode is on.`}
            </p>
          ) : null}
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`In the paths, ${NET} is mainnet or testnet. Amounts are in duffs (1 DASH = 100,000,000 duffs) except Platform amounts, which are in credits (1 DASH = 100,000,000,000 credits). Times are unix seconds.`}
          </p>
        </div>
        <Group id="global" title={t`Both networks`} endpoints={GLOBAL_ENDPOINTS} />
        <Group id="per-network" title={t`Per network`} endpoints={NETWORK_ENDPOINTS} />
        <section className="rx-card min-w-0 p-4" id="examples" data-api-examples>
          <h2 className="mb-3 text-lg font-semibold">{t`Examples`}</h2>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            {CURL_EXAMPLES.map((c) => (
              <div key={c.id} className="rx-api-curl min-w-0" data-curl={c.id}>
                <pre className="min-w-0 whitespace-pre-wrap break-all">
                  <code>{c.command}</code>
                </pre>
                <Copy value={c.command} label={t`Copy command`} />
              </div>
            ))}
          </div>
        </section>
        <section className="rx-card min-w-0 p-4" id="data-collection" data-api-collection>
          <h2 className="mb-3 text-lg font-semibold">{t`How the data is collected`}</h2>
          <div className="grid gap-2 text-sm">
            <p>
              {t`Every 15 minutes the crawler opens a P2P connection to every registered masternode's address, to every node that answered in the past week and to new addresses it learns from our Dash node and from other nodes. It completes the version handshake and disconnects. It doesn't relay transactions and keeps only what the node announces.`}
            </p>
            <p>
              {t`Masternode registrations and payments come from our own Dash node. Platform data comes from evonodes' DAPI, each answer confirmed by a second evonode. Reachability is measured from one vantage point, so a node that blocks or rate-limits the crawler shows as unreachable even when others can reach it.`}
            </p>
            <p>{t`Addresses of nodes that aren't masternodes are never published, only counted.`}</p>
            <p>
              {t`The site and the API are served from documents the crawler publishes after each crawl, so they stay up when the crawler doesn't.`}
            </p>
          </div>
        </section>
      </div>
    </PageFrame>
  )
}

function Group({ id, title, endpoints }: { id: string; title: string; endpoints: ApiEndpoint[] }) {
  return (
    <section className="grid min-w-0 gap-3" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="grid gap-3">
        {endpoints.map((e) => (
          <Endpoint key={e.id} endpoint={e} />
        ))}
      </div>
    </section>
  )
}

function Endpoint({ endpoint: e }: { endpoint: ApiEndpoint }) {
  const { t, i18n } = useLingui()
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const title = endpointTitle(e)
  const href = useRouterState({ select: (s) => s.location.href })
  const link = () => {
    const url = new URL(href, window.location.origin)
    url.hash = e.id
    return url.href
  }
  return (
    <article className="rx-card min-w-0 p-4" id={e.id} data-endpoint={e.id} data-method={e.method}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-all font-mono text-sm font-semibold">
          <a href={`#${e.id}`} className="no-underline hover:underline">
            {title}
          </a>
        </h3>
        <div className="flex items-center gap-1">
          <Copy value={`${API_ORIGIN}${e.path}${e.query ?? ''}`} label={t`Copy URL of ${title}`} />
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            data-copy-anchor={e.id}
            aria-label={t`Copy link to ${title}`}
            title={t`Copy link to ${title}`}
            onClick={() => {
              void copyText(link()).then((ok) => {
                if (!ok) return
                setDone(true)
                announce(t`Link copied`)
                window.clearTimeout(timer.current)
                timer.current = window.setTimeout(() => {
                  setDone(false)
                }, COPIED_MS)
              })
            }}
          >
            <Icon name={done ? 'check' : 'link'} size="sm" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--dh-ink-2)]">{i18n._(e.summary)}</p>
    </article>
  )
}
