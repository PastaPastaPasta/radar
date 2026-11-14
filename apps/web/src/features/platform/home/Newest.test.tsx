import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/features/entity/test-utils'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { NewestBlocks } from './Newest'

interface Blocks {
  resultSet: { header: { hash: string; height: number } }[]
}

const PE = 'https://api.pe.dashhq.org'

let recorded: Blocks

beforeEach(async () => {
  recorded = await fixtureBody<Blocks>('pe', 'mainnet', 'blocks--limit-5,order-desc')
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Newest blocks holds still @PE-02', () => {
  it('keeps its rows while the pointer is anywhere on the card, says so, and catches up on leaving', async () => {
    let extra = 0
    server.use(
      http.get(`${PE}/blocks`, () => {
        const top = recorded.resultSet[0]!
        const newer = Array.from({ length: extra }, (_, i) => ({
          ...top,
          header: {
            ...top.header,
            height: top.header.height + extra - i,
            hash: `${'F'.repeat(63)}${i}`,
          },
        }))
        return HttpResponse.json({
          ...recorded,
          resultSet: [...newer, ...recorded.resultSet].slice(0, 5),
        })
      }),
    )
    await renderInApp(<NewestBlocks />)
    const top = recorded.resultSet[0]!.header.height
    const card = await waitFor(() => {
      const el = document.getElementById('newest-blocks')
      expect(within(el!).getAllByRole('row').length).toBeGreaterThan(1)
      return el!
    })
    expect(card).toHaveTextContent(top.toLocaleString('en-US'))

    fireEvent.pointerEnter(within(card).getByRole('heading', { name: 'Newest blocks' }))
    extra = 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
    await waitFor(() => expect(card.querySelector('[data-paused="true"]')).not.toBeNull())
    expect(card).toHaveTextContent('Paused · 1 newer')
    expect(card).not.toHaveTextContent((top + 1).toLocaleString('en-US'))

    fireEvent.pointerLeave(within(card).getByRole('heading', { name: 'Newest blocks' }))
    await waitFor(() => expect(card).toHaveTextContent((top + 1).toLocaleString('en-US')))
    expect(card.querySelector('[data-paused="true"]')).toBeNull()
    expect(screen.queryByText(/Paused/)).toBeNull()
  })
})
