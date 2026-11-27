import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderAt } from './test-utils'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'
const SITES = 'GCSi8NkjXyRpLC7FsEnCfx5ntmWZ16bD2t9zc4JiT4X3'

/** The start of real mainnet transitions: a DashPay contact request, a site replace and a top-up. */
const DATA = {
  dashpay:
    'AgEVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQEAAAACO3NFd4tYH1s48SQLiC/kYYDZb3Kh25McAj6fzVcmc0QYDmNvbnRhY3RSZXF1ZXN0oqG0rG/vIuoqGmjoEjZEs1eHX2tBLBgQkoHBRueycbwAAPDVZT9t9mt9B+t6kKu/6O4/zy8tVFK0lHB9rFIbW7XLBRBhY2NvdW50UmVmZXJlbmNlBPwD++AAEmVu',
  site: 'AgEVWfMilR4UwW99f5ZDE3orBhTViyXyWRosHoiwkzPQmQEAAQACaIooA/ZZylcq3ZOjjJzEFU6kbaroLhMAsWaaXAYx1uEIBHNpdGXhzcMckHzfVPRiNp5VVl/qjuQ4S3UAIg+0Rvv8d/FcugAAAwQHY29udGVudBJRZGFzaC1tYW5pZmVzdDp2MTpiZDFkZWFkZWFjNTFlYjFhNmY4ODY5MTQ4MmYwNWQ1OWRiM2MzYjk2',
  topUp:
    'BAAAxgEBX254WeLtZ+GJWnUMfHajw3dU/HMeqsVVUL5uOVEy8/8BAAAAot1CASOpCYdtPgefZa274cIFpmzM/EH3imzjArLFgYAsHVVggzz2TcDkeiQRglJDVkUFu/WDQvIrAAAAAAAAAJFyOFvuthtjbKXCMvKA1PI9RvdXfzQSm07uLPCuxC5ya2KDuclhJEdEk9FUz9zJxwPcVSVc7ES2CzEbmw7spW5sG8pvQN1/Pey3',
}

const row = (n: number, kind: keyof typeof DATA) => ({
  hash: n.toString(16).toUpperCase().padStart(64, '0'),
  index: 0,
  blockHash: null,
  blockHeight: 1000 - n,
  type: kind === 'topUp' ? 'IDENTITY_TOP_UP' : 'BATCH',
  batchType: kind === 'dashpay' ? 'DOCUMENT_CREATE' : kind === 'site' ? 'DOCUMENT_REPLACE' : null,
  data: DATA[kind],
  timestamp: new Date(Date.UTC(2026, 10, 27) - n * 60_000).toISOString(),
  gasUsed: 1000,
  status: 'SUCCESS',
  error: null,
  owner: { identifier: M, aliases: [] },
})

const ROWS = [
  row(1, 'site'),
  row(2, 'dashpay'),
  row(3, 'topUp'),
  row(4, 'dashpay'),
  row(5, 'site'),
  row(6, 'dashpay'),
]
const hashes = (...at: number[]) => at.map((i) => ROWS[i]!.hash)

/** Answers `/transactions` with `ROWS` and notes the query of each read; `/dataContract/:id` has no name. */
function stubTransactions() {
  const asked: URLSearchParams[] = []
  server.use(
    http.get('*/transactions', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname !== '/transactions') return undefined
      asked.push(url.searchParams)
      return HttpResponse.json({
        resultSet: ROWS,
        pagination: { page: 1, limit: Number(url.searchParams.get('limit')), total: ROWS.length },
      })
    }),
    http.get('*/dataContract/:id', ({ params }) =>
      HttpResponse.json({ identifier: params.id, name: null }),
    ),
  )
  return asked
}

const shownHashes = () =>
  Array.from(document.querySelectorAll('#identity-transactions tbody tr[data-row-id]'), (r) =>
    r.getAttribute('data-row-id'),
  )

const picker = () =>
  waitFor(() => {
    const el = document.querySelector('#identity-transactions [data-contract-filter]')
    if (!el) throw new Error('no picker')
    return el as HTMLElement
  })

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Identity transitions filters @PE-15', () => {
  it('keeps the transitions that act on the contract in the address, from one read of 100', async () => {
    const asked = stubTransactions()
    renderAt(`/identity/${M}?tab=transactions&contract=${DASHPAY}`)
    await waitFor(() => {
      expect(shownHashes()).toEqual(hashes(1, 3, 5))
    })
    expect(asked).toHaveLength(1)
    const q = asked[0]!
    expect(q.get('owner')).toBe(M)
    expect(q.get('limit')).toBe('100')
    expect(q.getAll('transaction_type')).toContain('1')
    expect(q.getAll('transaction_type')).not.toContain('3')
    expect(screen.getByText(/Contract: DashPay/)).toBeInTheDocument()
  })

  it('offers the contracts the identity used and filters by the one chosen, reading nothing more', async () => {
    const user = userEvent.setup()
    const asked = stubTransactions()
    renderAt(`/identity/${M}?tab=transactions`)
    const el = await picker()
    await user.click(el.querySelector('summary')!)
    const dashpay = await within(el).findByRole('radio', { name: /DashPay/ })
    expect(within(el).getByRole('radio', { name: /GCSi8N/ })).toBeInTheDocument()
    expect(within(el).getByText(/From all 6 of its transitions/)).toBeInTheDocument()
    await user.click(dashpay)
    await waitFor(() => {
      expect(shownHashes()).toEqual(hashes(1, 3, 5))
    })
    expect(asked).toHaveLength(1)
  })

  it('sends status to Platform Explorer with the identity as owner', async () => {
    const user = userEvent.setup()
    const asked = stubTransactions()
    renderAt(`/identity/${M}?tab=transactions&status=fail`)
    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(0)
    })
    expect(asked[0]!.get('status')).toBe('FAIL')
    expect(asked[0]!.get('owner')).toBe(M)
    expect(asked[0]!.get('limit')).toBe('10')
    expect(await screen.findByText('Failed only')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => {
      expect(screen.queryByText('Failed only')).toBeNull()
    })
  })

  it('takes a pasted contract ID and refuses anything else', async () => {
    const user = userEvent.setup()
    stubTransactions()
    renderAt(`/identity/${M}?tab=transactions`)
    const el = await picker()
    await user.click(el.querySelector('summary')!)
    const field = within(el).getByLabelText('Or paste a contract ID')
    await user.type(field, 'dpns{Enter}')
    expect(await within(el).findByRole('alert')).toHaveTextContent(/isn’t a contract ID/)
    await user.clear(field)
    await user.type(field, `${SITES}{Enter}`)
    await waitFor(() => {
      expect(shownHashes()).toEqual(hashes(0, 4))
    })
  })
})
