import { afterEach, describe, expect, it, vi } from 'vitest'
import { offerUpdate, resetUpdate, setUpdateLoader, updateOffer } from './update-state'

afterEach(() => {
  setUpdateLoader(undefined)
  resetUpdate()
})

describe('update offer', () => {
  it('loads the notice for an offer raised before its loader was set', () => {
    const apply = vi.fn()
    offerUpdate({ apply })
    const load = vi.fn()
    setUpdateLoader(load)
    expect(load).toHaveBeenCalledTimes(1)
    updateOffer()?.apply()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('loads nothing when no offer is waiting', () => {
    const load = vi.fn()
    setUpdateLoader(load)
    expect(load).not.toHaveBeenCalled()
  })
})
