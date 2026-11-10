import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '@/app'

export function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

export function saveDevnet(name = 'ruby'): void {
  localStorage.setItem(
    'radar.devnets',
    JSON.stringify([{ name, dapiAddresses: ['192.0.2.1:1443'] }]),
  )
}
