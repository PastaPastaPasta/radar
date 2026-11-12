import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecodedTx } from '@/data/core/types'
import { I18nProvider, i18n } from '@/i18n'
import { NOW, renderInRouter, stamp } from '@/ui/test-utils'
import { Settlement } from './Settlement'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const SEEN = Date.UTC(2026, 10, 10, 9, 41, 12)
const MINED = Date.UTC(2026, 10, 10, 9, 42, 30)

function tx(over: Partial<DecodedTx> = {}): DecodedTx {
  return { txid: 'ab'.repeat(32), height: 100, time: MINED, ...over } as DecodedTx
}

async function renderSettlement(
  t: DecodedTx,
  firstSeen?: { at: number; stamp: ReturnType<typeof stamp> },
) {
  await renderInRouter(
    <I18nProvider i18n={i18n}>
      <Settlement tx={t} coinbase={false} firstSeen={firstSeen} />
    </I18nProvider>,
  )
  return document.querySelector<HTMLElement>('[data-step="seen"]')
}

describe('Settlement received time @HY-07', () => {
  it('shows an exact receipt time, also once the transaction is mined', async () => {
    const seen = await renderSettlement(tx(), { at: SEEN, stamp: stamp({ source: 'hyphen' }) })
    expect(seen).toHaveTextContent('Received')
    expect(seen).toHaveTextContent('first seen in the mempool')
    expect(seen).toHaveTextContent('09:41:12 UTC')
    expect(screen.queryByText(/aren’t kept once/)).toBeNull()
  })

  it('opens at the step a mined transaction has, with no empty Received step and one muted line', async () => {
    const seen = await renderSettlement(tx())
    expect(seen).toBeNull()
    expect(screen.queryByText('Received')).toBeNull()
    expect(screen.queryByText(/not recorded/)).toBeNull()
    expect(document.querySelector('[data-step]')).toHaveAttribute('data-step', 'instantsend')
    expect(
      screen.getByText('Mempool arrival times aren’t kept once a transaction is mined.'),
    ).toBeVisible()
  })

  it('says it is in the mempool while a transaction is pending with no sighting', async () => {
    const seen = await renderSettlement(tx({ height: undefined, time: undefined }))
    expect(seen).toHaveTextContent('Received')
    expect(seen).toHaveTextContent('in the mempool')
    expect(screen.queryByText(/aren’t kept once/)).toBeNull()
  })
})
