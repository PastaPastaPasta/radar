import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter, createQueryClient } from '@/app'
import type * as ClientModule from '@/data/core/client'
import type * as QueryModule from '@/data/query'
import { prefetchForRoute } from '@/data/query'
import type * as I18nModule from '@/i18n'
import { i18n } from '@/i18n'

const catalog = vi.hoisted((): { ready: Promise<void> } => ({ ready: Promise.resolve() }))
vi.mock('@/i18n', async (original) => {
  const actual = await original<typeof I18nModule>()
  return {
    ...actual,
    get i18nReady() {
      return catalog.ready
    },
  }
})

vi.mock('@/data/query', async (original) => {
  const actual = await original<typeof QueryModule>()
  return { ...actual, prefetchForRoute: vi.fn(actual.prefetchForRoute) }
})

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

describe('first load before the catalog', () => {
  const active = i18n.locale
  afterEach(() => {
    vi.mocked(prefetchForRoute).mockClear()
    i18n.activate(active)
    catalog.ready = Promise.resolve()
  })

  it('starts no loader while no locale is active, and runs them once the catalog is in', async () => {
    let release!: () => void
    catalog.ready = new Promise((r) => (release = r))
    // As on a first visit: nothing is active until the catalog chunk has loaded.
    ;(i18n as unknown as { _locale: string })._locale = ''
    expect(() => i18n._('x')).toThrow()
    const queryClient = createQueryClient()
    const router = createAppRouter(
      queryClient,
      createMemoryHistory({ initialEntries: ['/blocks'] }),
    )
    const loading = router.load()
    await new Promise((r) => setTimeout(r, 300))
    expect(prefetchForRoute).not.toHaveBeenCalled()

    i18n.activate(active)
    release()
    await loading
    expect(prefetchForRoute).toHaveBeenCalled()
    expect(router.state.matches.at(-1)?.status).toBe('success')
  })
})
