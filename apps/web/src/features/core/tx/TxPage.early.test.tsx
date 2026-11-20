import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import type * as FollowTip from '../follow-tip'
import { core } from '@/data/core/client'
import { enableEarlyAnswers } from '@/data/early'
import { renderAt } from '../hy-shared/test-utils'

const probe = vi.hoisted(() => ({ fit: true }))
vi.mock('@/data/hyphen/fit', () => ({ useHyphenFit: () => probe.fit }))

const tip = vi.hoisted(() => ({ unknown: false }))
vi.mock('../follow-tip', async (original) => {
  const actual = await original<typeof FollowTip>()
  return {
    ...actual,
    useFollowTip: (...args: Parameters<typeof actual.useFollowTip>) =>
      tip.unknown ? undefined : actual.useFollowTip(...args),
  }
})

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'

function deferred() {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  return { gate, release }
}

/** DAPI's answer waits on `gate`; the index answers at once with DAPI's transaction, changed by `edit`. */
function indexedFirst(edit: (tx: Record<string, unknown>) => Record<string, unknown>) {
  const dapi = deferred()
  const tx = core.tx.bind(core)
  vi.spyOn(core, 'tx').mockImplementation(async (...args) => {
    await dapi.gate
    return tx(...args)
  })
  vi.spyOn(core, 'indexedTx').mockImplementation(async (net, txid, signal) => {
    const real = await tx(net, txid, signal)
    if (!real.data) return null
    return {
      ...real,
      source: 'hyphen',
      proved: false,
      fallback: 'dapi-cold',
      data: edit(real.data as never) as never,
    }
  })
  return dapi
}

const minedStat = () =>
  [...document.querySelectorAll('.rx-stat__label')].find((el) =>
    el.textContent?.startsWith('Mined'),
  )?.parentElement ?? null
const checking = () => screen.queryAllByText(/checking with DAPI/i)

describe('Transaction page, indexed first', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    enableEarlyAnswers(false)
    probe.fit = true
    tip.unknown = false
  })

  it("shows no confirmation count from the index's own, possibly hours-old, tip until the live tip is known", async () => {
    enableEarlyAnswers()
    tip.unknown = true
    const dapi = indexedFirst((tx) => ({ ...tx, confirmations: 723 }))
    renderAt(`/tx/${TRANSFER}`)
    await waitFor(() => expect(minedStat()).not.toBeNull())
    expect(checking().length).toBeGreaterThan(0)
    expect(screen.queryByText(/confirmations?$/)).toBeNull()
    dapi.release()
    await waitFor(() => expect(checking()).toHaveLength(0))
  })

  it('shows a mined transaction from the index as mined, by its block, before its time is known', async () => {
    enableEarlyAnswers()
    const dapi = indexedFirst(({ time, ...tx }) => (void time, tx))
    renderAt(`/tx/${TRANSFER}`)
    await waitFor(() => expect(minedStat()).not.toBeNull())
    expect(minedStat()).toHaveTextContent(/In block [\d,]+/)
    expect(screen.queryByText('Unconfirmed')).toBeNull()
    expect(screen.queryByText('In the mempool')).toBeNull()
    expect(checking().length).toBeGreaterThan(0)
    dapi.release()
    await waitFor(() => expect(checking()).toHaveLength(0))
    expect(screen.queryByText('Unconfirmed')).toBeNull()
    expect(document.querySelector('[data-index-differed]')).toBeNull()
  })

  it("says so when DAPI's answer differs from the index's it replaced", async () => {
    enableEarlyAnswers()
    const dapi = indexedFirst((tx) => ({ ...tx, height: (tx.height as number) - 1 }))
    renderAt(`/tx/${TRANSFER}`)
    await waitFor(() => expect(checking().length).toBeGreaterThan(0))
    expect(document.querySelector('[data-index-differed]')).toBeNull()
    dapi.release()
    await waitFor(() => expect(document.querySelector('[data-index-differed]')).not.toBeNull())
    expect(document.querySelector('[data-index-differed]')).toHaveTextContent(
      "The index differed; DAPI's answer is shown",
    )
  })

  it('shows nothing from the index while the probe says it is stale', async () => {
    enableEarlyAnswers()
    probe.fit = false
    const dapi = indexedFirst((tx) => tx)
    renderAt(`/tx/${TRANSFER}`)
    await new Promise((r) => setTimeout(r, 100))
    expect(checking()).toHaveLength(0)
    expect(minedStat()).toBeNull()
    dapi.release()
    await waitFor(() => expect(minedStat()).not.toBeNull())
    expect(checking()).toHaveLength(0)
  })
})
