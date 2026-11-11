import { createContext, useContext, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { denomination, readUnitPreference, type DisplayUnit, type Density } from '@/lib/units'

export interface RateInfo {
  /** The rate's own name for where it comes from, e.g. an exchange. */
  provider: string
  stamp: SourceStamp
}

export interface UnitsValue {
  /** The Dash denomination DASH figures are drawn in; DASH when USD is the primary unit. */
  unit: DisplayUnit
  /** USD per DASH from the rate source; fiat figures are hidden without it. */
  usdPerDash?: number
  rate?: RateInfo
  /** USD is the primary unit and the rate is in: Dash amounts lead with USD and DASH follows. */
  usdPrimary?: boolean
  testnet: boolean
}

const UnitsContext = createContext<UnitsValue | undefined>(undefined)

export function UnitsProvider({ value, children }: { value: UnitsValue; children: ReactNode }) {
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}

export function useUnits(): UnitsValue {
  return useContext(UnitsContext) ?? { unit: denomination(readUnitPreference()), testnet: false }
}

const DensityContext = createContext<Density>('prose')

/** Amounts inside show eight decimals (tables); outside, four (stats and prose). */
export function AmountDensity({ value, children }: { value: Density; children: ReactNode }) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

export function useDensity(): Density {
  return useContext(DensityContext)
}
