import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('State transitions filters', () => {
  it('tells a name typed into Owner that it needs an identity ID, and a short string what an ID is @PE-12', async () => {
    const user = userEvent.setup()
    renderAt('/platform/txs')
    await screen.findByRole('heading', { level: 1, name: 'State transitions' })
    const box = await waitFor(() => screen.getByRole('textbox', { name: 'Owner' }))
    await user.type(box, 'pshenmic.dash{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Owner filter takes an identity ID, not a name.',
    )
    await user.clear(box)
    await user.type(box, 'a!{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('43 or 44 base58 characters')
  })
})
