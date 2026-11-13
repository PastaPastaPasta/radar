import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'
import { renderAt } from '../test-utils'

afterEach(() => {
  vi.restoreAllMocks()
})

const DECODED = {
  actionType: 'IdentityTopUp',
  actionTypeNumber: 3,
  hash: 'f9'.repeat(32),
  ownerId: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  identityNonce: null,
  identityContractNonce: null,
  userFeeIncrease: 0,
  signaturePublicKeyId: null,
  byteLength: 3,
  body: { identityId: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp' },
}
const decoded = () =>
  vi
    .spyOn(sdk, 'decode')
    .mockImplementation(() =>
      Promise.resolve({ ok: true as const, data: DECODED, proved: false, tookMs: 1 }),
    )

describe('transition tool', () => {
  it('decodes a pasted transition and summarises it @NX-71', async () => {
    const decode = decoded()
    const user = userEvent.setup()
    renderAt('/tools/transition')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Transition decoder' }),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText('Signed state transition'))
    await user.paste('010203')
    expect(await screen.findByText('Identity top-up')).toBeInTheDocument()
    expect(decode).toHaveBeenCalledWith('stateTransition', new Uint8Array([1, 2, 3]), {})
    expect(screen.getByText('Size (bytes)')).toBeInTheDocument()
  })

  it('asks Platform Explorer to check it and shows an acceptance @PE-34', async () => {
    decoded()
    let body: unknown
    server.use(
      http.post('https://api.pe.dashhq.org/transaction/verify', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ result: true })
      }),
    )
    const user = userEvent.setup()
    renderAt('/tools/transition')
    await user.click(await screen.findByLabelText('Signed state transition'))
    await user.paste('010203')
    await user.click(screen.getByRole('button', { name: 'Check this transition' }))
    const outcome = await waitFor(() => {
      const el = document.querySelector('[data-verify]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(outcome.dataset.verify).toBe('valid')
    expect(body).toEqual({ base64: 'AQID' })
  })

  it('shows why Platform would reject it @PE-34', async () => {
    decoded()
    server.use(
      http.post('https://api.pe.dashhq.org/transaction/verify', () =>
        HttpResponse.json({ result: false, error: 'invalid signature', code: 10 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/tools/transition')
    await user.click(await screen.findByLabelText('Signed state transition'))
    await user.paste('010203')
    await user.click(screen.getByRole('button', { name: 'Check this transition' }))
    const status = await screen.findByRole('status')
    expect(within(status).getByText('Platform would reject this transition.')).toBeInTheDocument()
    expect(within(status).getByText('invalid signature')).toBeInTheDocument()
  })

  it('still decodes, and says checking is unavailable, in Decentralized only mode @PE-34', async () => {
    writeSourceMode('decentralized')
    decoded()
    const user = userEvent.setup()
    renderAt('/tools/transition')
    await user.click(await screen.findByLabelText('Signed state transition'))
    await user.paste('010203')
    expect(await screen.findByText('Identity top-up')).toBeInTheDocument()
    expect(document.querySelector('[data-unavailable="mode"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Check this transition' })).toBeNull()
  })

  it('refuses garbage without decoding @NX-71', async () => {
    const decode = decoded()
    const user = userEvent.setup()
    renderAt('/tools/transition')
    await user.click(await screen.findByLabelText('Signed state transition'))
    await user.paste('zz zz zz !!')
    expect(await screen.findByText(/isn't hex, base64 or a list of numbers/)).toBeInTheDocument()
    expect(decode).not.toHaveBeenCalled()
  })
})
