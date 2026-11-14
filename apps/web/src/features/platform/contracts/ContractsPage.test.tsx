import { createMemoryHistory } from '@tanstack/react-router'
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { App } from '@/app'
import { installFixtureSdk } from '@/test/msw/sdk-transport'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const renderAt = (url: string) => {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

afterEach(async () => {
  await installFixtureSdk()
})

describe('the contracts list', () => {
  it('shows Platform Explorer’s rows and says owner names are missing when the SDK cannot answer @X-09', async () => {
    const transport = await installFixtureSdk()
    transport.call = () =>
      Promise.resolve({ ok: false, error: { kind: 'network', message: 'The SDK is unreachable' } })
    renderAt('/contracts?sort=-docs&tokens=1')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(document.querySelector('[data-names-unavailable]')).toHaveTextContent(
        /Owner names are unavailable/,
      )
    })
    expect(document.querySelector('[data-source="pe"]')).not.toBeNull()
  })

  it('says nothing about names while the SDK answers @X-09', async () => {
    await installFixtureSdk()
    renderAt('/contracts?sort=-docs&tokens=1')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    })
    await new Promise((r) => setTimeout(r, 300))
    expect(document.querySelector('[data-names-unavailable]')).toBeNull()
  })
})
