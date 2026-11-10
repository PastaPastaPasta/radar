import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './app'

describe('App', () => {
  it('renders the index route', async () => {
    render(<App history={createMemoryHistory({ initialEntries: ['/'] })} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Radar' })).toBeInTheDocument()
  })

  it('accepts the network search param', async () => {
    render(<App history={createMemoryHistory({ initialEntries: ['/?network=testnet'] })} />)

    expect(await screen.findByRole('heading', { name: 'Radar' })).toBeInTheDocument()
  })
})
