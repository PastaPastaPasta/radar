import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from '../test-utils'
import { stubSdkCalls } from '../test-sdk'

afterEach(() => {
  vi.restoreAllMocks()
})

const wire = (data: unknown) =>
  Promise.resolve({ ok: true as const, data, proved: false, tookMs: 1 })

describe('decoders index', () => {
  it('lists the decoders for a name it does not know @NX-72', async () => {
    renderAt('/tools/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Decoders' })).toBeInTheDocument()
    for (const id of ['contract', 'identity', 'document', 'proof', 'path', 'transition']) {
      expect(document.querySelector(`[data-decoder-link="${id}"]`)).not.toBeNull()
    }
  })
})

describe('byte decoders', () => {
  it('decodes pasted hex locally and keeps the bytes out of the address @NX-71', async () => {
    const decode = vi.spyOn(sdk, 'decode').mockImplementation(() => wire({ id: 'abc', version: 1 }))
    const user = userEvent.setup()
    renderAt('/tools/contract')
    const box = await screen.findByLabelText('Serialized data contract')
    await user.click(box)
    await user.paste('00ff10')
    await waitFor(() => expect(decode).toHaveBeenCalled())
    const [kind, bytes] = decode.mock.calls[0]!
    expect(kind).toBe('dataContract')
    expect([...bytes]).toEqual([0, 255, 16])
    expect(await screen.findByText('Decoded')).toBeInTheDocument()
    expect(window.location.href).not.toContain('00ff10')
  })

  it('says what is wrong with bytes that are not hex or base64 @NX-71', async () => {
    const decode = vi.spyOn(sdk, 'decode')
    const user = userEvent.setup()
    renderAt('/tools/identity')
    await user.click(await screen.findByLabelText('Serialized identity'))
    await user.paste('not bytes at all !!')
    expect(await screen.findByText(/isn't hex, base64 or a list of numbers/)).toBeInTheDocument()
    expect(decode).not.toHaveBeenCalled()
  })

  it('shows the SDK message when the bytes do not decode @NX-71', async () => {
    vi.spyOn(sdk, 'decode').mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        error: { kind: 'invalid-response', message: 'unable to deserialize' },
      }),
    )
    const user = userEvent.setup()
    renderAt('/tools/identity')
    await user.click(await screen.findByLabelText('Serialized identity'))
    await user.paste('0102')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('unable to deserialize')).toBeInTheDocument()
  })
})

describe('document decoder', () => {
  const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
  it('needs the contract and type, then decodes against them @NX-71', async () => {
    const contractBytes = new Uint8Array([9, 9])
    stubSdkCalls({
      'contracts.serialized': () => ({
        id: DPNS,
        bytes: contractBytes,
        documentTypes: ['domain', 'preorder'],
      }),
    })
    const decode = vi.spyOn(sdk, 'decode').mockImplementation(() => wire({ $id: 'doc' }))
    const user = userEvent.setup()
    renderAt(`/tools/document?contract=${DPNS}`)
    await user.click(await screen.findByLabelText('Serialized document'))
    await user.paste('0a0b')
    expect(await screen.findByText(/Choose the contract and the document type/)).toBeInTheDocument()
    expect(decode).not.toHaveBeenCalled()
    await user.selectOptions(await screen.findByLabelText('Document type'), 'domain')
    await waitFor(() => expect(decode).toHaveBeenCalled())
    const [kind, , opts] = decode.mock.calls[0]!
    expect(kind).toBe('document')
    expect(opts).toEqual({ contract: contractBytes, type: 'domain' })
    expect(screen.getByLabelText('Document type')).toHaveValue('domain')
  })
})

describe('path tool', () => {
  it('reads the preset the address names @NX-72', async () => {
    const calls = stubSdkCalls({
      'system.pathElements': () => [
        { path: [], key: '20', elementType: 'tree', value: null, sum: null, referenceTarget: null },
      ],
    })
    renderAt('/tools/path?preset=root')
    expect(await screen.findByText('Identities')).toBeInTheDocument()
    expect(calls).toHaveBeenCalledWith(
      'mainnet',
      'system.pathElements',
      expect.objectContaining({
        path: [],
        keys: expect.arrayContaining(['20', '40', '68']) as string[],
      }),
      expect.anything(),
    )
  })

  it('refuses a key that is not hex without asking @NX-72', async () => {
    const calls = stubSdkCalls({ 'system.pathElements': () => [] })
    const user = userEvent.setup()
    renderAt('/tools/path')
    await user.type(await screen.findByLabelText('Keys'), 'xyz')
    expect(await screen.findByText(/Every segment and key is hex/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read elements' })).toBeDisabled()
    expect(calls).not.toHaveBeenCalled()
  })
})
