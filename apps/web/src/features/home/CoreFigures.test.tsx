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

const stamped = <T,>(data: T, asOf = Date.now()) => ({
  data,
  source: 'dapi' as const,
  asOf,
  fetchedAt: asOf,
  proved: false,
})

const status = (blocks: number, difficulty: number) =>
  stamped<CoreChainStatus>({
    chain: 'main',
    blocks,
    headers: blocks,
    bestBlockHash: 'ab'.repeat(32),
    difficulty,
    medianTime: 0,
    chainWork: '',
    syncProgress: 1,
    isSynced: true,
  })

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
    vi.spyOn(core, 'tip').mockResolvedValue(
      stamped({ height: 2_571_277, hash: 'ab'.repeat(32), time: Date.now() }),
    )
    const client = new QueryClient()
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116,445,795.87'))
    expect(reads).toHaveBeenCalledTimes(1)

    act(() => {
      client.setQueryData(
        dapiKeys('mainnet', 'tip'),
        stamped({ height: 2_571_278, hash: 'cd'.repeat(32), time: Date.now() }),
      )
    })

    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116,900,000.12'))
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('shows its own age on a figure read long before the height it sits beside', async () => {
    const old = Date.now() - 20 * 60_000
    vi.spyOn(core, 'status').mockResolvedValue({ ...status(2_571_277, 116_445_795.87), asOf: old })
    vi.spyOn(core, 'tip').mockResolvedValue(
      stamped({ height: 2_571_300, hash: 'ab'.repeat(32), time: Date.now() }),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } },
    })
    await renderFigures(client)
    await waitFor(() => expect(difficultyStat()).toHaveTextContent('116'))
    const badge = difficultyStat().querySelector('[data-source="dapi"]')
    expect(badge).not.toBeNull()
    expect(badge).toHaveAttribute('data-state', 'stale')
  })
})
