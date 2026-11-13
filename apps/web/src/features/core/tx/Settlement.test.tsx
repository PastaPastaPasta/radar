import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { instantLockFields } from '@/data/core/lock-state'
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

describe('Settlement step states @HY-07', () => {
  const state = (name: string) =>
    document.querySelector(`[data-step="${name}"]`)?.getAttribute('data-state')

  it('marks an InstantSend step that never happened as skipped, not done', async () => {
    await renderSettlement(tx())
    expect(state('instantsend')).toBe('skipped')
    expect(state('mined')).toBe('done')
    expect(state('chainlocked')).toBe('pending')
    expect(screen.getByText('No InstantSend lock was seen')).toBeVisible()
  })

  it('marks a lock one node reports as a claim and a confirmed one as done', async () => {
    await renderSettlement(tx({ isInstantLocked: true, instantLockClaim: 'one-node' }))
    expect(state('instantsend')).toBe('claimed')
  })

  it('never marks a lock done on the strength of one source, whichever path read it', async () => {
    await renderSettlement(tx(instantLockFields(true)))
    expect(state('instantsend')).toBe('claimed')
    expect(
      screen.getByText('reported by one node; no second source has confirmed it'),
    ).toBeVisible()
  })

  it('marks a lock with no claim attached done', async () => {
    await renderSettlement(tx({ isInstantLocked: true }))
    expect(state('instantsend')).toBe('done')
    expect(state('chainlocked')).toBe('pending')
  })

  it('marks a ChainLock one node reports as a claim', async () => {
    await renderSettlement(tx({ chainLockClaim: 'one-node' }))
    expect(state('chainlocked')).toBe('claimed')
  })

  it('leaves the steps after an unmined transaction as pending or future', async () => {
    await renderSettlement(tx({ height: undefined, time: undefined }))
    expect(state('instantsend')).toBe('pending')
    expect(state('mined')).toBe('future')
    expect(state('chainlocked')).toBe('future')
  })
})

describe('Settlement once the block is ChainLocked @IN-05 @HY-07', () => {
  const steps = () =>
    [...document.querySelectorAll('[data-step]')].map((el) => el.getAttribute('data-step'))

  it.each([
    ['the node reports a lock', { isChainLocked: true, ...instantLockFields(true) }],
    ['the node reports no lock', { isChainLocked: true, ...instantLockFields(false) }],
    ['Hyphen answered', { isChainLocked: true, ...instantLockFields(false, 'hyphen') }],
    ['one node claims the ChainLock', { chainLockClaim: 'one-node' as const }],
    ['no InstantSend field is carried', { isChainLocked: true }],
  ])('goes Mined → ChainLocked with no InstantSend step when %s', async (_name, over) => {
    await renderSettlement(tx(over))
    expect(steps()).toEqual(['mined', 'chainlocked'])
    expect(screen.queryByText(/InstantSend/)).toBeNull()
    expect(screen.queryByText(/not known/)).toBeNull()
  })

  it('keeps the Received step of a transaction the page watched arrive', async () => {
    await renderSettlement(tx({ isChainLocked: true }), {
      at: SEEN,
      stamp: stamp({ source: 'hyphen' }),
    })
    expect(steps()).toEqual(['seen', 'mined', 'chainlocked'])
  })

  it('still says no lock was seen for a mined block that is not ChainLocked', async () => {
    await renderSettlement(tx(instantLockFields(false)))
    const step = document.querySelector('[data-step="instantsend"]')!
    expect(step).toHaveAttribute('data-state', 'skipped')
    expect(step).toHaveTextContent('No InstantSend lock was seen')
  })
})

describe('Settlement InstantSend step when Hyphen answered @IN-05 @HY-07', () => {
  const step = () => document.querySelector('[data-step="instantsend"]')!

  it.each([
    ['a pending transaction', { height: undefined, time: undefined }],
    ['a mined one', {}],
  ])('says the lock is not known from this source for %s', async (_name, over) => {
    await renderSettlement(tx({ ...instantLockFields(false, 'hyphen'), ...over }))
    expect(step()).toHaveAttribute('data-state', 'unknown')
    expect(step()).toHaveTextContent('not known from this source')
    expect(screen.queryByText('No InstantSend lock was seen')).toBeNull()
    expect(screen.queryByText('waiting for the masternodes to lock it')).toBeNull()
  })

  it('names Hyphen for a lock it reports', async () => {
    await renderSettlement(tx(instantLockFields(true, 'hyphen')))
    expect(step()).toHaveAttribute('data-state', 'claimed')
    expect(step()).toHaveTextContent('recorded by Hyphen; no second source has confirmed it')
  })
})
