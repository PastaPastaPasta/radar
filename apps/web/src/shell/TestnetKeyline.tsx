import { useEffect } from 'react'
import { useNetwork } from '@/features/search'
import { isDevnet } from '@/lib/network'

/** A thin yellow frame around the page on every network except mainnet, in both themes. */
export function TestnetKeyline() {
  const net = useNetwork()
  const kind = net === 'mainnet' ? 'main' : isDevnet(net) ? 'dev' : 'test'

  useEffect(() => {
    document.documentElement.dataset.networkKind = kind
    return () => {
      delete document.documentElement.dataset.networkKind
    }
  }, [kind])

  if (kind === 'main') return null
  return (
    <div
      aria-hidden="true"
      data-testnet-keyline={kind}
      className={`pointer-events-none fixed inset-0 z-[90] border-[3px] border-[var(--rx-testnet,#F2C230)] ${kind === 'dev' ? 'border-dashed' : 'border-solid'}`}
    />
  )
}
