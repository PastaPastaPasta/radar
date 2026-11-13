import { describe, expect, it } from 'vitest'
import {
  decoderPrefetch,
  queryPrefetch,
  sdkReferencePrefetch,
  transitionToolPrefetch,
} from '@/data/query/prefetch/tools'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const SEARCH = { net: 'mainnet' } as never

describe('tools prefetch', () => {
  it('reads the picked contract for the schema panel, DPNS by default', () => {
    const items = queryPrefetch('mainnet', {}, {})
    expect(items.map((i) => i.cost)).toEqual(['sdk'])
    expect(queryPrefetch('mainnet', {}, { contract: DPNS })).toHaveLength(1)
  })

  it('reads nothing for an id that is not one', () => {
    expect(queryPrefetch('mainnet', {}, { contract: 'nope' })).toEqual([])
  })

  it('reads the contract of the document decoder only', () => {
    const search = { contract: DPNS } as never
    expect(decoderPrefetch('mainnet', { decoder: 'document' }, search)).toHaveLength(1)
    expect(decoderPrefetch('mainnet', { decoder: 'contract' }, search)).toEqual([])
    expect(decoderPrefetch('mainnet', { decoder: 'document' }, {})).toEqual([])
  })

  it('has nothing to read for the transition tool and the reference', () => {
    expect(transitionToolPrefetch('mainnet', {}, SEARCH)).toEqual([])
    expect(sdkReferencePrefetch('mainnet', {}, SEARCH)).toEqual([])
  })
})
