import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useNetwork } from '@/features/entity'
import { denomination, getUnitPrefs, subscribeUnitPrefs } from '@/lib/units'
import { UnitsProvider } from '@/ui/base'
import type { FiatRateValue } from './fiat-rate'

const FiatRate = lazy(() => import('./fiat-rate'))

/**
 * Gives every `Amount` the viewer's unit, the testnet unit label and, on mainnet, the USD rate. USD as the primary
 * unit applies once the rate is in; until then, and on networks without fiat, amounts show in DASH.
 */
export function UnitsMount({ children }: { children: ReactNode }) {
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const [rate, setRate] = useState<FiatRateValue>()
  const testnet = net !== 'mainnet'
  const wantsFiat = (prefs.fiat || prefs.unit === 'USD') && !testnet
  const live = wantsFiat ? rate : undefined
  return (
    <UnitsProvider
      value={{
        unit: denomination(prefs.unit),
        testnet,
        usdPerDash: live?.usd,
        rate: live,
        usdPrimary: live !== undefined && prefs.unit === 'USD',
      }}
    >
      {wantsFiat ? (
        <Suspense fallback={null}>
          <FiatRate onRate={setRate} />
        </Suspense>
      ) : null}
      {children}
    </UnitsProvider>
  )
}
