import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { healthQueries } from '@/data/health-queries'
import { useSourceHealth } from '@/data/health'
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
 * Runs Hyphen's freshness probe while a page is open. `lag` is set only once the probe has measured the index
 * behind the chain: a statement about the index, never a guess. A page whose connection polls fine can still be
 * showing old data, so it asks this, not whether its own requests succeed, before it says "live".
 */
export function useHyphenFreshness(): { stale: boolean; lag: string | undefined } {
  const net = useNetwork()
  useQuery({ ...healthQueries.hyphen(net), enabled: !isDevnet(net) })
  const health = useSourceHealth('hyphen')
  const stale = health.state === 'stale' && health.lag !== undefined
  return { stale, lag: stale ? health.lag?.detail : undefined }
}

export function StaleIndexNotice() {
  const { t } = useLingui()
  const lagged = useHyphenLagSentence(useNetwork(), useHyphenFreshness().lag)
  if (lagged === undefined) return null
  return (
    <p
      role="status"
      data-stale-index
      className="rounded border border-[var(--dh-warn,#b45309)] p-3"
    >
      {lagged} {t`Figures on this page are as of that block, not live.`}
    </p>
  )
}
