import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

const CONTRACT = 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Contract tokens tab @NX-24', () => {
  it('shows supplies in whole tokens with the symbol, the short token ID, and the name apart from it', async () => {
    renderAt(`/contract/${CONTRACT}?tab=tokens`)
    await waitFor(() => {
      const row = document.querySelector('#tokens tbody tr:not(.rx-skelrow)')
      expect(row).not.toBeNull()
      expect(row?.textContent).toMatch(/AxAYWy/)
    })
    const row = document.querySelector('#tokens tbody tr:not(.rx-skelrow)')!
    const cells = Array.from(row.querySelectorAll('td')).map((c) => c.textContent ?? '')
    expect(row.textContent).toContain('21,000,000')
    expect(row.textContent).not.toContain('2,100,000,000,000,000')
    expect(cells.filter((c) => c.includes('SANS')).length).toBeGreaterThan(0)
    expect(cells.some((c) => /^AxAYWy…\w{4}\b/.test(c) && !c.includes('SANS'))).toBe(true)
  })
})
