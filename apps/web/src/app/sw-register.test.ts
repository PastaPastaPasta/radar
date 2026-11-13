import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './sw-register'

describe('registerServiceWorker', () => {
  it('registers nothing yet', () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { register } })
    registerServiceWorker()
    expect(register).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
