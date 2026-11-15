import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '@/app'

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

afterEach(() => {
  setOnline(true)
})

describe('Offline page @NX-77', () => {
  it('explains the loss of connection instead of redirecting, and recovers', async () => {
    setOnline(false)
    const history = createMemoryHistory({ initialEntries: ['/offline'] })
    render(<App history={history} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Offline' })).toBeInTheDocument()
    expect(history.location.pathname).toBe('/offline')
    expect(screen.getByText(/You’re offline: Radar can’t reach the network/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your saved items' })).toHaveAttribute('href', '/saved')
    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(await screen.findByText(/You’re back online/)).toBeInTheDocument()
  })
})
