import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { installFixtureSdk } from '@/test/msw/sdk-transport'
import { renderAt } from './test-utils'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

describe('the home page Platform tip', () => {
  it("shows Platform Explorer's figure as a stand-in while the SDK is still loading @IN-01", async () => {
    const transport = await installFixtureSdk()
    transport.connect = () => new Promise(() => undefined)
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="platform"]')
      expect(el).toHaveTextContent(/Epoch \d+/)
      return el!
    })
    expect(row.querySelector('[data-source="pe"]')).not.toBeNull()
    expect(row.querySelector('[data-fallback="sdk-cold"]')).not.toBeNull()
  })
})
