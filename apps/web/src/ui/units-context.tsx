import { createContext, useContext, type ReactNode } from 'react'
import { readUnitPreference, type DisplayUnit, type Density } from '@/lib/units'

export interface UnitsValue {
  unit: DisplayUnit
  /** USD per DASH from the rate source; fiat figures are hidden without it. */
  usdPerDash?: number
  testnet: boolean
}

const UnitsContext = createContext<UnitsValue | undefined>(undefined)

export function UnitsProvider({ value, children }: { value: UnitsValue; children: ReactNode }) {
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}

export function useUnits(): UnitsValue {
  return useContext(UnitsContext) ?? { unit: readUnitPreference(), testnet: false }
}

const DensityContext = createContext<Density>('prose')

/** Amounts inside show eight decimals (tables); outside, four (stats and prose). */
export function AmountDensity({ value, children }: { value: Density; children: ReactNode }) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

export function useDensity(): Density {
  return useContext(DensityContext)
}
