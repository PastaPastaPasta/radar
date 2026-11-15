import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const DOC = 'FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS'

describe('Document page', () => {
  it('names the document by its type and shows the full ID once', async () => {
    renderAt(`/document/${DPNS}/domain/${DOC}`)
    const heading = await screen.findByRole('heading', { level: 1, name: 'domain' })
    expect(heading.textContent).toBe('domain')
    const band = document.querySelector<HTMLElement>('[data-record="document"]')!
    expect(band.querySelector('[data-record-kind]')).toHaveTextContent('Document')
    const id = band.querySelector('[data-record-id]')!
    expect(id).toHaveTextContent(DOC)
    expect((band.textContent ?? '').split(DOC.slice(0, 8)).length - 1).toBe(1)
    expect(band.textContent).not.toContain('…')
    await waitFor(() => {
      expect(document.title).toBe('domain · Radar')
    })
    expect(await screen.findByRole('heading', { name: 'Data' })).toBeInTheDocument()
  })
})
