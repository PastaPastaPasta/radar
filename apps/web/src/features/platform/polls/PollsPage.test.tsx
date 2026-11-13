import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Polls page', () => {
  it('lists the polls of a custom window @NX-44', async () => {
    renderAt('/polls?range=custom&from=2026-11-01&to=2027-01-31')
    await waitFor(() => {
      expect(document.querySelector('#polls-list')).not.toBeNull()
      expect(document.querySelectorAll('#polls-list a[href^="/contest/"]').length).toBeGreaterThan(
        0,
      )
    })
  })
})
