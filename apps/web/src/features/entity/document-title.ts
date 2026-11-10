import { useEffect } from 'react'
import { networkName, useNetwork } from './network'

export function useDocumentTitle(title: string | undefined): void {
  const net = useNetwork()
  useEffect(() => {
    if (!title) return
    const suffix = net === 'mainnet' ? 'Radar' : `${networkName(net)} · Radar`
    document.title = title === 'Radar' ? 'Radar' : `${title} · ${suffix}`
  }, [title, net])
}
