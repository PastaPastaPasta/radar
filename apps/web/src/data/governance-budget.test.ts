import { describe, expect, it } from 'vitest'
import { fundedInBudget } from './governance-budget'
import type { HyProposal } from './hyphen/schemas'

const AT = 1_000_000
const p = (hash: string, net: number, amount: bigint, over: Partial<HyProposal> = {}) =>
  ({
    hash,
    votes: { yes: net, no: 0, abstain: 0 },
    meetsFundingThreshold: true,
    paymentAmount: amount,
    startTime: AT - 1,
    endTime: AT + 1,
    ...over,
  }) as HyProposal

describe('fundedInBudget', () => {
  it('takes passing proposals by net yes votes while the rest of the budget covers each, skipping one that doesn’t fit', () => {
    const funded = fundedInBudget(
      [p('a', 500, 60n), p('b', 400, 50n), p('c', 300, 30n), p('d', 200, 10n)],
      { budget: 100n, superblockAt: AT },
    )
    expect([...funded].sort()).toEqual(['a', 'c', 'd'])
  })

  it('leaves out a proposal that doesn’t pass or whose window misses the superblock', () => {
    const funded = fundedInBudget(
      [
        p('a', 500, 10n, { meetsFundingThreshold: false }),
        p('b', 400, 10n, { endTime: AT - 1 }),
        p('c', 300, 10n, { startTime: AT + 1 }),
        p('d', 200, 10n),
      ],
      { budget: 100n, superblockAt: AT },
    )
    expect([...funded]).toEqual(['d'])
  })
})
