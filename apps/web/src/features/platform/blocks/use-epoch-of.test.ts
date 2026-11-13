import { describe, expect, it } from 'vitest'
import { epochForHeight } from './use-epoch-of'

const epochs = [
  { index: 90, firstBlockHeight: 900 },
  { index: 88, firstBlockHeight: 800 },
  { index: 89, firstBlockHeight: 850 },
]

describe('epochForHeight', () => {
  it('names the last epoch that started at or before the height, whatever the order of the list', () => {
    expect(epochForHeight(epochs, 800)).toBe(88)
    expect(epochForHeight(epochs, 849)).toBe(88)
    expect(epochForHeight(epochs, 850)).toBe(89)
    expect(epochForHeight(epochs, 5000)).toBe(90)
  })

  it('has no answer for a height before the first epoch listed', () => {
    expect(epochForHeight(epochs, 799)).toBeUndefined()
    expect(epochForHeight([], 1)).toBeUndefined()
  })
})
