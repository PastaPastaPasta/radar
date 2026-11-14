import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { bytesToHex } from '@/lib/hex'
import { renderAt } from '../test-utils'
import type * as GroveProof from './grove-proof'
import { proofBytes, proofText } from './proof-fixtures'

const parser = vi.hoisted(() => ({ parse: vi.fn<(bytes: Uint8Array) => Promise<string>>() }))
vi.mock('./grove-proof', async (original) => ({
  ...(await original<typeof GroveProof>()),
  parseGroveProof: parser.parse,
}))

beforeEach(() => {
  parser.parse.mockReset()
})

describe('a proof pasted into the contract decoder', () => {
  it('is named a proof and linked to the proof decoder @NX-72', async () => {
    parser.parse.mockResolvedValue(proofText('testnet-dpns-domain-asc'))
    vi.spyOn(sdk, 'decode').mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: { kind: 'invalid-response', message: 'UnexpectedVariant' },
      }),
    )
    const user = userEvent.setup()
    renderAt('/tools/contract')
    await user.click(await screen.findByLabelText('Serialized data contract'))
    await user.paste(bytesToHex(proofBytes('testnet-dpns-domain-asc')))
    const note = await screen.findByText(/look like a GroveDB proof/)
    expect(within(note.closest('p')!).getByRole('link')).toHaveAttribute('href', '/tools/proof')
  })

  it('says nothing about proofs for bytes the proof reader refuses too @NX-72', async () => {
    const { ProofParseError } = await import('./grove-proof')
    parser.parse.mockRejectedValue(new ProofParseError('invalid', 'bad'))
    vi.spyOn(sdk, 'decode').mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: { kind: 'invalid-response', message: 'unable to deserialize' },
      }),
    )
    const user = userEvent.setup()
    renderAt('/tools/contract')
    await user.click(await screen.findByLabelText('Serialized data contract'))
    await user.paste('0102')
    await screen.findByRole('alert')
    await waitFor(() => expect(parser.parse).toHaveBeenCalled())
    expect(document.querySelector('[data-looks-like-proof]')).toBeNull()
  })
})

describe('proof decoder', () => {
  it('shows the layers and the totals of a pasted proof @NX-72', async () => {
    parser.parse.mockResolvedValue(proofText('testnet-dpns-domain-asc'))
    const user = userEvent.setup()
    renderAt('/tools/proof')
    await user.click(await screen.findByLabelText('Proof bytes'))
    await user.paste(bytesToHex(proofBytes('testnet-dpns-domain-asc')))
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
