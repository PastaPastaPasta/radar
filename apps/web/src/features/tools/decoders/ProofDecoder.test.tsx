import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from '../test-utils'
import type * as GroveProof from './grove-proof'
import { toHex } from './bytes'
import { proofBytes, proofText } from './proof-fixtures'

const parser = vi.hoisted(() => ({ parse: vi.fn<(bytes: Uint8Array) => Promise<string>>() }))
vi.mock('./grove-proof', async (original) => ({
  ...(await original<typeof GroveProof>()),
  parseGroveProof: parser.parse,
}))

beforeEach(() => {
  parser.parse.mockReset()
})

describe('proof decoder', () => {
  it('shows the layers and the totals of a pasted proof @NX-72', async () => {
    parser.parse.mockResolvedValue(proofText('testnet-dpns-domain-asc'))
    const user = userEvent.setup()
    renderAt('/tools/proof')
    await user.click(await screen.findByLabelText('Proof bytes'))
    await user.paste(toHex(proofBytes('testnet-dpns-domain-asc')))
    const summary = await screen.findByText('What the proof contains')
    expect(summary).toBeInTheDocument()
    const layers = document.querySelector('[data-proof-layers]')!
    expect(within(layers as HTMLElement).getAllByText(/^Layer \d+/).length).toBeGreaterThan(1)
    expect(parser.parse).toHaveBeenCalledTimes(1)
    expect(parser.parse.mock.calls[0]![0]).toHaveLength(
      proofBytes('testnet-dpns-domain-asc').length,
    )
  })

  it('says so when the reader rejects the bytes @NX-72', async () => {
    const { ProofParseError } = await import('./grove-proof')
    parser.parse.mockRejectedValue(new ProofParseError('invalid', 'bad'))
    const user = userEvent.setup()
    renderAt('/tools/proof')
    await user.click(await screen.findByLabelText('Proof bytes'))
    await user.paste('0102030405')
    expect(await screen.findByText('These bytes are not a GroveDB proof.')).toBeInTheDocument()
  })
})
