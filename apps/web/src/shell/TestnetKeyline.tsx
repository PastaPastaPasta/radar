import { useEffect } from 'react'
import { useNetwork } from '@/features/search'
import { isDevnet } from '@/lib/network'
import { networkName } from '@/ui/base'

/** A 4 px frame around the page on every network except mainnet, with the network's name hanging from its top edge. */
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
      className={`pointer-events-none fixed inset-0 z-[90] border-4 border-[var(--rx-testnet,#F2C230)] ${kind === 'dev' ? 'border-dashed' : 'border-solid'}`}
    >
      <span
        data-testnet-label
        className="rx-tnbadge absolute -top-1 left-1/2 -translate-x-1/2 !h-[18px] !rounded-t-none !rounded-b-[4px] !px-3 !text-[11px] uppercase tracking-wide"
      >
        {networkName(net)}
      </span>
    </div>
  )
}
