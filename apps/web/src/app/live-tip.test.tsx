import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableLiveTip, useLiveTip } from './live-tip'

const live = vi.hoisted(() => ({ tip: vi.fn(), release: vi.fn() }))
vi.mock('@/data/core/live', () => ({ coreLive: { tip: live.tip } }))
vi.mock('@/features/entity', () => ({ useNetwork: () => 'testnet' }))

function Probe() {
  useLiveTip()
  return null
}

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Probe />
    </QueryClientProvider>,
  )

describe('useLiveTip', () => {
  afterEach(() => {
    live.tip.mockReset()
    live.release.mockReset()
  })

  it('follows the tip of the network on screen and lets go when the page unmounts', async () => {
    live.tip.mockReturnValue(live.release)
    enableLiveTip()
    const view = mount()
    await waitFor(() => expect(live.tip).toHaveBeenCalledWith('testnet', expect.any(QueryClient)))
    view.unmount()
    expect(live.release).toHaveBeenCalledTimes(1)
  })
})
