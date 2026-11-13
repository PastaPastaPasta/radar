import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import type { CoreChainStatus } from '@/data/core/types'
import { dapiKeys } from '@/data/query'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { CoreFigures } from './CoreZone'

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

const difficultyStat = () => screen.getByText('Difficulty').closest<HTMLElement>('.rx-stat')!

describe('Core figures on the home page @HY-01', () => {
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
          <CoreFigures />
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

  const badge = () => difficultyStat().querySelector('[data-source="dapi"]')

  it('shows no age on a figure read at the shown height when the tip is republished later @HY-01', async () => {
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
    await waitFor(() => expect(screen.getByText('Height').closest('.rx-stat')).not.toBeNull())
    expect(badge()).toBeNull()
  })

  it('shows its own age on a figure that stays behind the tip @HY-01', async () => {
    vi.spyOn(core, 'status').mockResolvedValue(
      status(2_571_277, 116_445_795.87, Date.now() - 20 * 60_000),
    )
    vi.spyOn(core, 'tip').mockResolvedValue(tip(2_571_300))
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } },
    })
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116'))
    expect(badge()).toBeNull()
    await waitFor(() => expect(badge()).not.toBeNull(), { timeout: 12_000 })
    expect(badge()).toHaveAttribute('data-state', 'stale')
  }, 20_000)
})
