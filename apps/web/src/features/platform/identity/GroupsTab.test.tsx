import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from '@/data/errors'
import { pe } from '@/data/pe/client'
import { renderAt } from './test-utils'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Groups tab', () => {
  it('says Platform Explorer’s contract list is missing and offers a retry', async () => {
    const ask = vi
      .spyOn(pe, 'identityDataContracts')
      .mockRejectedValue(
        new SourceError({ source: 'pe', kind: 'unavailable', message: 'Platform Explorer is down' }),
      )
    renderAt(`/identity/${M}?tab=groups`)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Platform Explorer isn.t available here/)
    expect(ask).toHaveBeenCalledTimes(1)

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(ask).toHaveBeenCalledTimes(2)
  })
})
