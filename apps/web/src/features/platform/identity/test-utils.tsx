import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '@/app'

export function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}
