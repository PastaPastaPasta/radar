import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Names page', () => {
  it('lists registered names and offers the next page @NX-41', async () => {
    renderAt('/names')
    await waitFor(() => {
      expect(document.querySelectorAll('a[href^="/name/"]').length).toBeGreaterThan(5)
    })
    expect(document.querySelector('a[href*="after="]')).not.toBeNull()
  })

  it('pages an alphabetical list with Previous and Next, never Newer and Older @NX-41', async () => {
    renderAt('/names')
    const next = await screen.findByRole('link', { name: 'Next' })
    expect(next.getAttribute('href')).toContain('after=')
    expect(screen.getByText('Previous').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByText('Older')).toBeNull()
    expect(screen.queryByText('Newer')).toBeNull()
  })

  it('searches by the homograph-safe form @NX-41', async () => {
    renderAt('/names?q=ali')
    await waitFor(() => {
      expect(document.body.textContent).toContain('a11')
    })
    expect(document.querySelector('[data-searched]')?.textContent).toContain('a11')
  })
})
