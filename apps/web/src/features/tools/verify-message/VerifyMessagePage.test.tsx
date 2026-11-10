import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { base58CheckEncode } from '@/lib/base58'
import { renderAt } from '../test-utils'
import vectors from './vectors.json'
import { verifySignedMessage } from './verify'

const v = vectors[0]!
const signature = (() => {
  for (const rec of [0, 1, 2, 3]) {
    const sig = Buffer.concat([
      Buffer.from([31 + rec]),
      Buffer.from(v.r, 'hex'),
      Buffer.from(v.s, 'hex'),
    ]).toString('base64')
    if (
      verifySignedMessage({ address: v.mainnet, message: v.msg, signature: sig }).kind === 'valid'
    ) {
      return sig
    }
  }
  throw new Error('no recovery id verifies')
})()

const WIF = base58CheckEncode(0xcc, Uint8Array.from([...new Uint8Array(32).fill(9), 1]))

async function fill(address: string, message: string, sig: string) {
  const user = userEvent.setup()
  renderAt('/tools/verify-message')
  await user.type(await screen.findByLabelText('Address'), address)
  await user.click(screen.getByLabelText('Message'))
  await user.paste(message)
  await user.click(screen.getByLabelText('Signature'))
  await user.paste(sig)
  return user
}

describe('Verify message page', () => {
  it('says valid for a signature the address made @IN-08', async () => {
    const user = await fill(v.mainnet, v.msg, signature)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('This address signed this message.')).toBeInTheDocument()
    expect(document.querySelector('[data-result="valid"]')).not.toBeNull()
  })

  it('says invalid, and who signed, when the message was changed @IN-08', async () => {
    const user = await fill(v.mainnet, `${v.msg}!`, signature)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('This address did not sign this message.')).toBeInTheDocument()
    expect(document.querySelector('[data-result="invalid"]')).not.toBeNull()
  })

  it('says it cannot check a malformed signature @IN-08', async () => {
    const user = await fill(v.mainnet, v.msg, 'not a signature')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('That isn’t a Dash signature.')).toBeInTheDocument()
  })

  it('names the other network for a testnet address and links to it @IN-16', async () => {
    const user = await fill(v.testnet, v.msg, signature)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('This address signed this message.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Switch to testnet' })).toHaveAttribute(
      'href',
      expect.stringContaining('network=testnet'),
    )
  })

  it('works with the testnet selected @IN-16', async () => {
    const user = userEvent.setup()
    renderAt('/tools/verify-message?network=testnet')
    await user.type(await screen.findByLabelText('Address'), v.testnet)
    await user.click(screen.getByLabelText('Message'))
    await user.paste(v.msg)
    await user.click(screen.getByLabelText('Signature'))
    await user.paste(signature)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('This address signed this message.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Switch to testnet' })).toBeNull()
  })

  it('does not check while a field holds a private key @IN-08', async () => {
    const user = await fill(v.mainnet, v.msg, signature)
    await user.click(screen.getByLabelText('Message'))
    await user.clear(screen.getByLabelText('Message'))
    await user.paste(WIF)
    expect(await screen.findByRole('alert')).toHaveTextContent('private key or a recovery phrase')
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
  })

  it('keeps the inputs off the URL and clears the result with the fields @IN-08', async () => {
    const user = await fill(v.mainnet, v.msg, signature)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await screen.findByText('This address signed this message.')
    expect(window.location.href).not.toContain(v.mainnet)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.queryByText('This address signed this message.')).toBeNull())
    expect(screen.getByLabelText('Address')).toHaveValue('')
  })
})
