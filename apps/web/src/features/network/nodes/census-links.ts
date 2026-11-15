import type { MnFilter } from '@/data/masternodes/filter'
import type { CensusScope } from './census-math'

/**
 * The `/masternodes` search each census figure opens. Every figure counts enabled masternodes, so every link adds
 * that filter; the list's match count then equals the figure.
 */
const ENABLED = { status: ['enabled' as const] }

const inScope = (scope: CensusScope): Pick<MnFilter, 'type'> =>
  scope === 'evo' ? { type: ['evo' as const] } : {}

export const reachableLink = (): MnFilter => ({ reach: 'reachable', ...ENABLED })

export const unreachableLink = (scope: CensusScope): MnFilter => ({
  reach: 'unreachable',
  ...ENABLED,
  ...inScope(scope),
})

export const hostLink = (asns: readonly string[], scope: CensusScope): MnFilter => ({
  host: [...asns],
  ...ENABLED,
  ...inScope(scope),
})

export const countryLink = (code: string, scope: CensusScope): MnFilter => ({
  country: [code],
  ...ENABLED,
  ...inScope(scope),
})
