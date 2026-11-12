import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { useIndexHealth } from '@/data/index-health'
import { isDevnet } from '@/lib/network'
import { PageLink, useNetwork } from '@/features/entity'
import { Empty, useHyphenLagSentence, useInsightLagSentence } from '@/ui'

/** Hyphen indexes mainnet and testnet only. A devnet gets a plain explanation instead of a failed request. */
export function HyphenGate({ children }: { children: ReactNode }) {
  const { t } = useLingui()
  const net = useNetwork()
  if (!isDevnet(net)) return <>{children}</>
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
 * Hyphen's freshness for a page that shows Hyphen-only figures: `lag` is set only once the index has been
 * measured against DAPI's best height and found stale (`useIndexHealth`), a statement about the index and never a guess.
 */
export function useHyphenFreshness(): { stale: boolean; lag: string | undefined } {
  const index = useIndexHealth(useNetwork())
  const stale = index.state === 'stale'
  return { stale, lag: stale ? index.lag : undefined }
}

/**
 * The page's one notice that what it reads is behind: what is behind and by how much, what that leaves current,
 * and where to see the sources. Sections keep their own source line and say nothing more. `scope` replaces the
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
      className="rx-note rounded border border-[var(--dh-warn,#b45309)] p-3"
    >
      {hyphen} {insight ? `${insight} ` : null}
      {figures}{' '}
      {insightStale
        ? t`Blocks and transactions elsewhere in Radar are current.`
        : t`Blocks, transactions and addresses elsewhere in Radar are current.`}{' '}
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}
