import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const status = (s: string) => waitFor(() => expect(document.querySelector(`[data-status="${s}"]`)).not.toBeNull())

describe('Name page', () => {
  it('rejects a label DPNS cannot hold @NX-40', async () => {
    renderAt('/name/ab')
    await status('invalid')
  })

  it('reports a free name as available @NX-40', async () => {
    renderAt('/name/radarfx44661899')
    await status('available')
  })

  it('shows the owner and a Bridge link for a registered name @NX-40', async () => {
    renderAt('/name/pshenmic')
    await status('registered')
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href')?.includes('/identity/'))).toBe(true)
  })

  it('links a contested name to its contest @NX-40', async () => {
    renderAt('/name/reza')
    await status('contested')
    expect(document.querySelector('a[href="/contest/reza"]')).not.toBeNull()
  })
})
