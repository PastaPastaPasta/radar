import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { useIndexHealth } from '@/data/index-health'
import { isDevnet } from '@/lib/network'
import { PageLink, useNetwork } from '@/features/entity'
import { Empty, useHyphenLagSentence } from '@/ui'

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
 * The page's one notice that what it reads from Hyphen is behind: what is behind and by how much, what that
 * leaves current, and where to see the sources. Sections keep their own source line and say nothing more.
 * `scope` replaces the sentence about the figures when only part of the page is Hyphen's.
 */
export function StaleIndexNotice({ scope }: { scope?: string }) {
  const { t } = useLingui()
  const lagged = useHyphenLagSentence(useNetwork(), useHyphenFreshness().lag)
  if (lagged === undefined) return null
  return (
    <p
      role="status"
      data-stale-index
      className="rx-note rounded border border-[var(--dh-warn,#b45309)] p-3"
    >
      {lagged} {scope ?? t`Figures on this page are as of that block, not live.`}{' '}
      {t`Blocks, transactions and addresses elsewhere in Radar are current.`}{' '}
      <PageLink to="/status">{t`See the sources`}</PageLink>
    </p>
  )
}
