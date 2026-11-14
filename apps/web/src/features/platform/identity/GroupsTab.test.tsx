import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderAt } from './test-utils'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Groups tab', () => {
  it('says Platform Explorer’s contract list is missing and offers a retry', async () => {
    let asked = 0
    server.use(
      http.get(`*/identity/${M}/dataContracts`, () => {
        asked++
        return new HttpResponse(null, { status: 400 })
      }),
    )
    renderAt(`/identity/${M}?tab=groups`)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Platform Explorer isn.t answering/)
    expect(asked).toBe(1)

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    await screen.findByRole('alert')
    expect(asked).toBe(2)
  })
})
