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
  hyphenLock?: boolean,
) {
  await renderInRouter(
    <I18nProvider i18n={i18n}>
      <Settlement tx={t} coinbase={false} firstSeen={firstSeen} hyphenLock={hyphenLock} />
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

  it('marks every confirmed step done', async () => {
    await renderSettlement(tx({ isInstantLocked: true, isChainLocked: true }))
    expect(state('instantsend')).toBe('done')
    expect(state('chainlocked')).toBe('done')
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

describe('Settlement InstantSend step in a ChainLocked block @IN-05 @HY-07', () => {
  const step = () => document.querySelector('[data-step="instantsend"]')!
  const locked = (over: Partial<DecodedTx> = {}) =>
    tx({ isChainLocked: true, ...instantLockFields(false), ...over })

  it('says the state is not known, in the neutral style, when no source reports a lock', async () => {
    await renderSettlement(locked(), undefined, false)
    expect(step()).toHaveAttribute('data-state', 'unknown')
    expect(step()).toHaveTextContent(
      'not known: nodes drop InstantSend locks once a block is ChainLocked',
    )
    expect(screen.queryByText('No InstantSend lock was seen')).toBeNull()
  })

  it('says the same when Hyphen was not asked or is down', async () => {
    await renderSettlement(locked(), undefined, undefined)
    expect(step()).toHaveAttribute('data-state', 'unknown')
  })

  it('shows a lock Hyphen recorded after the node dropped its own, as one source’s claim', async () => {
    await renderSettlement(locked(), undefined, true)
    expect(step()).toHaveAttribute('data-state', 'claimed')
    expect(step()).toHaveTextContent('recorded by Hyphen; no second source has confirmed it')
  })

  it('keeps a lock a DAPI node still reports', async () => {
    await renderSettlement(locked(instantLockFields(true)), undefined, false)
    expect(step()).toHaveAttribute('data-state', 'claimed')
    expect(step()).toHaveTextContent('reported by one node; no second source has confirmed it')
  })

  it('names both sources when both recorded a lock', async () => {
    await renderSettlement(locked(instantLockFields(true)), undefined, true)
    expect(step()).toHaveTextContent('recorded by a DAPI node and Hyphen')
  })

  it('still says no lock was seen for a mined block that is not ChainLocked', async () => {
    await renderSettlement(tx(instantLockFields(false)), undefined, true)
    expect(step()).toHaveAttribute('data-state', 'skipped')
    expect(step()).toHaveTextContent('No InstantSend lock was seen')
  })
})
