import { render, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MnRow } from '@/data/masternodes/rows'
import { I18nProvider, i18n } from '@/i18n'
import { blocksAgo, MAINNET_BLOCK_MS, useMnColumns } from './columns'

describe('blocksAgo', () => {
  it('says how long ago a number of Core blocks was, in the largest unit that reads well @RA-20', () => {
    expect(blocksAgo(0, 'en')).toBe('~1 min. ago')
    expect(blocksAgo(12, 'en')).toBe('~32 min. ago')
    expect(blocksAgo(244, 'en')).toBe('~11 hr. ago')
    expect(blocksAgo(1271, 'en')).toBe('~2 days ago')
    expect(blocksAgo(129_400, 'en')).toBe('~8 mo. ago')
    expect(blocksAgo(1_620_000, 'en')).toBe('~8.1 yr. ago')
  })

  it('spaces blocks by mainnet’s average since DIP3, 157.5 s, unless told otherwise @RA-20', () => {
    expect(MAINNET_BLOCK_MS).toBe(157_500)
    expect(blocksAgo(2_016, 'en')).toBe(blocksAgo(2_016, 'en', 157_500))
    expect(blocksAgo(2_016, 'en', 150_000)).toBe('~4 days ago')
    expect(blocksAgo(2_016, 'en')).toBe('~4 days ago')
    expect(blocksAgo(20_000, 'en')).toBe('~36 days ago')
    expect(blocksAgo(20_000, 'en', 150_000)).toBe('~35 days ago')
  })

  it('speaks the reader’s language', () => {
    expect(blocksAgo(1271, 'de')).toBe('~vor 2 Tagen')
  })
})

describe('the last-paid and registered columns', () => {
  const row = { crawl: { last_paid_height: 2_570_000, registered_height: 1_028_255 } } as MnRow
  const cell = (id: string, options: Parameters<typeof useMnColumns>[0]) => {
    const { result } = renderHook(() => useMnColumns(options), {
      wrapper: ({ children }) => <I18nProvider i18n={i18n}>{children}</I18nProvider>,
    })
    const column = result.current.find((c) => c.id === id)!
    const render_ = (column as { cell: (ctx: unknown) => React.ReactNode }).cell
    return render(<>{render_({ row: { original: row } })}</>).container
  }

  it('measures from the tip the crawl was taken at and says the age is approximate @RA-20', () => {
    const paid = cell('last_paid', { crawl: true, tip: 2_572_016, blockMs: MAINNET_BLOCK_MS })
    expect(paid).toHaveTextContent('~4 days ago')
    expect(paid).toHaveTextContent('2,016 blocks')
    const registered = cell('registered', {
      crawl: true,
      tip: 2_572_016,
      blockMs: MAINNET_BLOCK_MS,
    })
    expect(registered).toHaveTextContent('1,028,255')
    expect(registered).toHaveTextContent(/~\d+(\.\d)? yr\. ago/)
  })

  it('gives only block counts where the network has no measured spacing @RA-20', () => {
    const paid = cell('last_paid', { crawl: true, tip: 2_572_016 })
    expect(paid).toHaveTextContent('2,016 blocks')
    expect(paid).not.toHaveTextContent('~')
  })

  it('shows the bare height with no tip to measure from @RA-20', () => {
    expect(cell('last_paid', { crawl: true, tip: 0, blockMs: MAINNET_BLOCK_MS })).toHaveTextContent(
      /^2,570,000$/,
    )
  })
})
