import { afterEach, describe, expect, it } from 'vitest'
import {
  getActiveNetwork,
  getRenderedNetwork,
  setActiveNetwork,
  setRenderedNetwork,
} from './active-network'

afterEach(() => {
  setRenderedNetwork('mainnet')
  setActiveNetwork('mainnet')
})

describe('the rendered network', () => {
  it('stays on the page on screen while a navigation to another network is loading', () => {
    setRenderedNetwork('mainnet')
    setActiveNetwork('testnet')

    expect(getActiveNetwork()).toBe('testnet')
    expect(getRenderedNetwork()).toBe('mainnet')
  })
})
