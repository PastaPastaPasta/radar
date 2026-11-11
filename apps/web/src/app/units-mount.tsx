import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useNetwork } from '@/features/entity'
import { getUnitPrefs, subscribeUnitPrefs } from '@/lib/units'
import { UnitsProvider } from '@/ui/base'

const FiatRate = lazy(() => import('./fiat-rate'))

/** Gives every `Amount` the viewer's unit, the testnet unit label and, on mainnet, the USD rate. */
export function UnitsMount({ children }: { children: ReactNode }) {
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const [usdPerDash, setRate] = useState<number>()
  const testnet = net !== 'mainnet'
  const wantsFiat = prefs.fiat && !testnet
  return (
    <UnitsProvider
      value={{ unit: prefs.unit, testnet, usdPerDash: wantsFiat ? usdPerDash : undefined }}
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
