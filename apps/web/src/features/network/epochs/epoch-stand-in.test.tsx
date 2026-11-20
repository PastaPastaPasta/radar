import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { enableEarlyAnswers } from '@/data/early'
import { sdk } from '@/data/sdk/client'
import { App } from '@/app'

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

vi.mock('@/ui/chart-view', () => ({ default: () => null }))
vi.mock('@/features/entity/platform/use-identity-name', () => ({
  useIdentityName: () => undefined,
}))
vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

/** The SDK's proof-checked epoch read waits on the returned gate; every other SDK read goes through. */
function slowSdkEpoch() {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const call = sdk.call.bind(sdk)
  vi.spyOn(sdk, 'call').mockImplementation(async (...args) => {
    if (args[1] === 'epoch.current') await gate
    return call(...args)
  })
  return release
}

const headline = () => screen.queryByRole('heading', { level: 1, name: /^Epoch \d+ is/ })
const checking = () => screen.queryAllByText(/Indexed by Platform Explorer · checking/)

describe.each([
  ['/epochs', 'the epochs page'],
  ['/platform', 'the Platform overview'],
])("the current epoch on %s (%s) before the SDK's proof", (path) => {
  afterEach(() => {
    vi.restoreAllMocks()
    enableEarlyAnswers(false)
  })

  it("shows Platform Explorer's epoch, labelled as checking, until the proof-checked one lands", async () => {
    enableEarlyAnswers()
    const release = slowSdkEpoch()
    renderAt(path)
    await waitFor(() => expect(headline()).not.toBeNull())
    expect(checking().length).toBeGreaterThan(0)
    release()
    await waitFor(() => expect(checking()).toHaveLength(0))
    expect(headline()).not.toBeNull()
  })

  it('waits for the proof-checked epoch when early answers are off', async () => {
    const release = slowSdkEpoch()
    renderAt(path)
    await new Promise((r) => setTimeout(r, 300))
    expect(headline()).toBeNull()
    release()
    await waitFor(() => expect(headline()).not.toBeNull())
    expect(checking()).toHaveLength(0)
  })
})
