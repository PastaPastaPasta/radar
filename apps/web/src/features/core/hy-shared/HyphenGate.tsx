import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { healthQueries } from '@/data/health-queries'
import { useSourceHealth } from '@/data/health'
import { isDevnet } from '@/lib/network'
import { PageLink, useNetwork } from '@/features/entity'
import { Empty } from '@/ui'

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
 * Runs Hyphen's freshness probe while a page is open, so a stale index says so. The notice stays quiet
 * until the probe has measured a lag: it is a statement about the index, never a guess.
 */
export function StaleIndexNotice() {
  const { t } = useLingui()
  const net = useNetwork()
  useQuery({ ...healthQueries.hyphen(net), enabled: !isDevnet(net) })
  const health = useSourceHealth('hyphen')
  if (health.state !== 'stale' || !health.lag) return null
  return (
    <p role="status" data-stale-index className="rounded border border-[var(--dh-warn,#b45309)] p-3">
      {t`Hyphen’s index is behind the chain: ${health.lag.detail}. Figures on this page are as of that block.`}
    </p>
  )
}
