import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Names page', () => {
  it('lists registered names and says more load as the reader scrolls @NX-41', async () => {
    renderAt('/names')
    await waitFor(() => {
      expect(document.querySelectorAll('a[href^="/name/"]').length).toBeGreaterThan(5)
    })
    expect(await screen.findByText(/shown\. More load as you scroll\./)).toBeInTheDocument()
  })

  it('scrolls an alphabetical list, with no Previous, Next, Newer or Older @NX-41', async () => {
    renderAt('/names')
    await screen.findByRole('button', { name: 'Show more' })
    for (const name of ['Previous', 'Next', 'Newer', 'Older']) {
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
  })

  it('searches by the homograph-safe form @NX-41', async () => {
    renderAt('/names?q=ali')
    await waitFor(() => {
      expect(document.body.textContent).toContain('a11')
    })
    expect(document.querySelector('[data-searched]')?.textContent).toContain('a11')
  })
})
