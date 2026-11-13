import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { useIndexHealth } from '@/data/index-health'
import { isDevnet } from '@/lib/network'
import { PageLink, useNetwork } from '@/features/entity'
import { Empty, Unavailable, useHyphenLagSentence, useInsightLagSentence } from '@/ui'

/**
 * Wraps a page that reads an index. Hyphen indexes mainnet and testnet only, so a devnet gets a plain explanation
 * instead of a failed request. In Decentralized only mode the page shows the mode's unavailable state once, in place
 * of its content; `unavailable` names what is missing, and `false` leaves the mode to a page that still has
 * something to show from DAPI.
 */
export function HyphenGate({
  children,
  unavailable,
}: {
  children: ReactNode
  unavailable?: string | false
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  if (!isDevnet(net)) {
    return off && unavailable !== false ? (
      <Unavailable title={unavailable ?? t`This page needs an indexer`} />
    ) : (
      <>{children}</>
    )
  }
  return (
    <Empty
      kind="unsupported-network"
      title={t`Hyphen doesn’t index devnets.`}
      body={t`This page reads from Hyphen. Switch to Mainnet or Testnet to see it.`}
      action={
        <PageLink to="/" search={{ network: 'mainnet' }}>
          {t`Back to Mainnet`}
        </PageLink>
      }
    />
  )
}

/**
 * The page's one notice that what it reads is behind: what is behind and by how much, what that leaves current
 * (left out on a phone, where the notice has to stay short), and where to see the sources. Sections keep their own source line and say nothing more. `scope` replaces the
 * sentence about the figures when only part of the page is behind.
 *
 * A page that reads Insight while Hyphen's index is stale passes `reads="insight"`: it is quiet while Insight is
 * current (unless `scope` says part of the page is still Hyphen's), and names both indexes and their lag once
 * Insight trails the chain as well.
 */
export function StaleIndexNotice({ scope, reads }: { scope?: string; reads?: 'insight' }) {
  const { t } = useLingui()
  const net = useNetwork()
  const index = useIndexHealth(net)
  const hyphen = useHyphenLagSentence(net, index.state === 'stale' ? index.lag : undefined)
  const insightStale = reads === 'insight' && index.insight.state === 'stale'
  const insight = useInsightLagSentence(net, insightStale ? index.insight.lag : undefined)
  if (hyphen === undefined) return null
  if (reads === 'insight' && !insightStale && scope === undefined) return null
  const figures =
    scope ??
    (insightStale
      ? t`Figures on this page are as of those blocks, not live.`
      : t`Figures on this page are as of that block, not live.`)
  return (
    <p
      role="status"
      data-stale-index
      className="rx-note rounded border border-[var(--dh-warn,#b45309)] p-3 max-sm:px-2.5 max-sm:py-2"
    >
      {hyphen} {insight ? `${insight} ` : null}
      {figures}{' '}
      <span className="max-sm:hidden" data-stale-elsewhere>
        {insightStale
          ? t`Blocks and transactions elsewhere in Radar are current.`
          : t`Blocks, transactions and addresses elsewhere in Radar are current.`}{' '}
      </span>
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}
