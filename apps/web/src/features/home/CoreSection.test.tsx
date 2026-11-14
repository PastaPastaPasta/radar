import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { SourceError } from '@/data/errors'
import type { CoreChainStatus } from '@/data/core/types'
import { dapiKeys } from '@/data/query'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { CoreSection } from './CoreSection'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const stamped = <T,>(data: T, asOf = Date.now(), height?: number) => ({
  data,
  source: 'dapi' as const,
  asOf,
  fetchedAt: asOf,
  proved: false,
  ...(height === undefined ? {} : { height }),
})

const status = (blocks: number, difficulty: number, asOf = Date.now()) =>
  stamped<CoreChainStatus>(
    {
      chain: 'main',
      blocks,
      headers: blocks,
      bestBlockHash: 'ab'.repeat(32),
      difficulty,
      medianTime: 0,
      chainWork: '',
      syncProgress: 1,
      isSynced: true,
    },
    asOf,
    blocks,
  )

const tip = (height: number, asOf = Date.now()) =>
  stamped({ height, hash: 'ab'.repeat(32), time: Date.now() }, asOf, height)

const difficultyStat = () => screen.getByText('Difficulty').closest<HTMLElement>('.rx-fig')!

describe('Core figures on the home page @HY-01', () => {
  /** The mark that speaks for DAPI in the section's one source line. */
  const lineMark = () =>
    document.querySelector<HTMLElement>('[data-home-sources] [data-source="dapi"]')

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function renderFigures(client: QueryClient) {
    await renderInRouter(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <CoreSection />
        </QueryClientProvider>
      </I18nProvider>,
    )
  }

  it('reads the difficulty again when a new block arrives', async () => {
    const reads = vi.spyOn(core, 'status')
    reads.mockResolvedValueOnce(status(2_571_277, 116_445_795.87))
    reads.mockResolvedValue(status(2_571_278, 116_900_000.12))
    vi.spyOn(core, 'tip').mockResolvedValue(tip(2_571_277))
    const client = new QueryClient()
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116,445,795.87'))
    expect(reads).toHaveBeenCalledTimes(1)

    act(() => {
      client.setQueryData(dapiKeys('mainnet', 'tip'), tip(2_571_278))
    })

    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116,900,000.12'))
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('keeps the section line current for a figure read at the shown height when the tip is republished later @HY-01', async () => {
    vi.spyOn(core, 'status').mockResolvedValue(
      status(2_571_277, 116_445_795.87, Date.now() - 20 * 60_000),
    )
    vi.spyOn(core, 'tip').mockResolvedValue(tip(2_571_277))
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } },
    })
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116'))
    act(() => {
      client.setQueryData(dapiKeys('mainnet', 'tip'), tip(2_571_277, Date.now() + 5 * 60_000))
    })
    await waitFor(() => expect(lineMark()).not.toBeNull())
    expect(lineMark()).toHaveAttribute('data-state', 'ok')
    expect(document.querySelectorAll('[data-home-sources] [data-source="dapi"]')).toHaveLength(1)
  })

  it('turns the section line stale for a figure that stays behind the tip, and keeps the age on the figure @HY-01', async () => {
    vi.spyOn(core, 'status').mockResolvedValue(
      status(2_571_277, 116_445_795.87, Date.now() - 20 * 60_000),
    )
    vi.spyOn(core, 'tip').mockResolvedValue(tip(2_571_300))
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } },
    })
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116'))
    expect(lineMark()).toHaveAttribute('data-state', 'ok')
    await waitFor(() => expect(lineMark()).toHaveAttribute('data-state', 'stale'), {
      timeout: 12_000,
    })
    expect(document.querySelectorAll('[data-home-sources] [data-source="dapi"]')).toHaveLength(1)
    expect(difficultyStat().querySelector('.rx-fig__src [data-source="dapi"]')).toHaveAttribute(
      'data-state',
      'stale',
    )
  }, 20_000)

  it('says the blocks are missing when the tip they are read from cannot be read', async () => {
    vi.spyOn(core, 'status').mockResolvedValue(status(2_571_277, 116_445_795.87))
    vi.spyOn(core, 'tip').mockRejectedValue(
      new SourceError({ source: 'dapi', kind: 'unavailable', message: 'No node answered' }),
    )
    await renderFigures(new QueryClient())
    const table = await screen.findByRole('table', { name: 'Latest Core blocks', hidden: true })
    const alert = await screen.findByText(/DAPI isn.t available here/)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
    expect(table).not.toHaveAttribute('aria-busy', 'true')
  })

  it('keeps waiting for the blocks when only a later read of the tip failed @HY-01', async () => {
    vi.spyOn(core, 'status').mockResolvedValue(status(2_571_277, 116_445_795.87))
    const reads = vi.spyOn(core, 'tip')
    reads.mockResolvedValueOnce(tip(2_571_277))
    reads.mockRejectedValue(
      new SourceError({ source: 'dapi', kind: 'unavailable', message: 'No node answered' }),
    )
    vi.spyOn(core, 'blockRows').mockReturnValue(new Promise<never>(() => undefined))
    const client = new QueryClient()
    await renderFigures(client)
    await waitFor(() => expect(client.getQueryData(dapiKeys('mainnet', 'tip'))).toBeDefined())
    await act(async () => {
      await client.invalidateQueries({ queryKey: dapiKeys('mainnet', 'tip') })
    })
    await waitFor(() =>
      expect(client.getQueryState(dapiKeys('mainnet', 'tip'))?.fetchStatus).toBe('idle'),
    )
    expect(client.getQueryState(dapiKeys('mainnet', 'tip'))?.error).not.toBeNull()
    expect(client.getQueryData(dapiKeys('mainnet', 'tip'))).toBeDefined()
    const table = await screen.findByRole('table', { name: 'Latest Core blocks', hidden: true })
    expect(table).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(/DAPI isn.t available here/)).toBeNull()
  })
})
