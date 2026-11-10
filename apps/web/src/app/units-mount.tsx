import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore, type ReactNode } from 'react'
import { rateQueries } from '@/data/rate/queries'
import { useNetwork } from '@/features/entity'
import { getUnitPrefs, subscribeUnitPrefs } from '@/lib/units'
import { UnitsProvider } from '@/ui'

/** Gives every `Amount` the viewer's unit, the testnet unit label and, on mainnet, the USD rate. */
export function UnitsMount({ children }: { children: ReactNode }) {
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const testnet = net !== 'mainnet'
  const rate = useQuery({ ...rateQueries.usd(), enabled: prefs.fiat && !testnet })
  const usdPerDash = prefs.fiat && !testnet ? rate.data?.data.usd : undefined
  return <UnitsProvider value={{ unit: prefs.unit, testnet, usdPerDash }}>{children}</UnitsProvider>
}
