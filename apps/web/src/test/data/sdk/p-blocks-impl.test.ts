import { afterEach, describe, expect, it, vi } from 'vitest'
import { pBlocksImpl, RESULT_WAIT_MS, type PBlocksReads } from '@/data/sdk/worker/impl/p-blocks'

const HASH = 'ab'.repeat(32)
const reads = (wait: () => Promise<unknown>) =>
  ({ stateTransitions: { waitForStateTransitionResult: wait } }) as unknown as PBlocksReads

const wait = (sdk: PBlocksReads) =>
  pBlocksImpl['stateTransitions.waitForStateTransitionResult'](sdk, { hash: HASH })

afterEach(() => {
  vi.useRealTimers()
})

describe('stateTransitions.waitForStateTransitionResult', () => {
  it('reports a transition the node executed', async () => {
    const out = await wait(reads(() => Promise.resolve({ status: 'SUCCESS' })))
    expect(out.data).toEqual({ hash: HASH, status: 'executed' })
  })

  it('reports a failed transition with the error the node wrote, and the balance when it has one', async () => {
    const out = await wait(
      reads(() => Promise.resolve({ status: 'ERROR', error: 'invalid revision', ownerBalance: 5n })),
    )
    expect(out.data).toEqual({
      hash: HASH,
      status: 'failed',
      error: 'invalid revision',
      ownerBalance: 5n,
    })
  })

  it('reports "pending" when the node says nothing in time, and does not wait for it', async () => {
    vi.useFakeTimers()
    const never = new Promise<never>(() => undefined)
    const answer = wait(reads(() => never))
    await vi.advanceTimersByTimeAsync(RESULT_WAIT_MS)
    expect((await answer).data).toEqual({ hash: HASH, status: 'pending' })
  })

  it('reports "pending" for a status it does not know, and swallows a late failure', async () => {
    const out = await wait(reads(() => Promise.resolve({ status: 'SOMETHING' })))
    expect(out.data.status).toBe('pending')
    vi.useFakeTimers()
    const late = new Promise<never>((_, reject) => setTimeout(reject, RESULT_WAIT_MS + 10, new Error('late')))
    const answer = wait(reads(() => late))
    await vi.advanceTimersByTimeAsync(RESULT_WAIT_MS + 20)
    expect((await answer).data.status).toBe('pending')
  })
})
