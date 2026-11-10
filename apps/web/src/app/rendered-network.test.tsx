import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setActiveNetwork, setRenderedNetwork } from '@/data/active-network'
import { healthRegistry, resetHealthRegistry, useAllSourceHealth } from '@/data/health'

afterEach(() => {
  resetHealthRegistry()
  setRenderedNetwork('mainnet')
  setActiveNetwork('mainnet')
})

describe('the rendered network', () => {
  it('keeps source health on the network of the page on screen until the navigation commits', () => {
    healthRegistry.report('mainnet', 'pe', { ok: true, latencyMs: 40 })
    for (let i = 0; i < 3; i++) healthRegistry.report('testnet', 'pe', { ok: false, kind: 'http' })
    setRenderedNetwork('mainnet')
    const { result } = renderHook(() => useAllSourceHealth().find((h) => h.source === 'pe'))
    expect(result.current?.state).toBe('ok')

    act(() => setActiveNetwork('testnet'))
    expect(result.current?.state).toBe('ok')

    act(() => setRenderedNetwork('testnet'))
    expect(result.current?.state).toBe('down')
  })
})
