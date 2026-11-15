import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { registerLabelOverlay } from '@/lib/well-known'
import { renderInApp } from '../test-utils'
import { OWNER } from './fixtures'
import { IdentityRef } from './IdentityRef'

vi.mock('./use-identity-name', () => ({ useIdentityName: () => 'owner.dash' }))

describe('IdentityRef', () => {
  it('links to the identity with its identicon, on the page’s network', async () => {
    await renderInApp(<IdentityRef id={OWNER} />, '/?network=testnet')
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `/identity/${OWNER}?network=testnet`)
    expect(link.querySelector('[data-art="identicon"]')).not.toBeNull()
  })

  it('shows the DPNS name when the reader has no label for the identity', async () => {
    await renderInApp(<IdentityRef id={OWNER} />, '/?network=testnet')
    expect(screen.getByText('owner.dash')).toBeInTheDocument()
  })

  it('shows the label it is given in place of the identifier', async () => {
    await renderInApp(<IdentityRef id={OWNER} label="alice.dash" size="sm" />)
    expect(screen.getByRole('link', { name: /alice/ })).toBeInTheDocument()
    expect(screen.getByText('alice.dash')).toBeInTheDocument()
  })

  it('shows the reader’s own label ahead of the DPNS name @NX-74', async () => {
    const remove = registerLabelOverlay((_net, kind, id) =>
      kind === 'identity' && id === OWNER ? 'My payout identity' : undefined,
    )
    try {
      await renderInApp(<IdentityRef id={OWNER} />, '/?network=testnet')
      expect(await screen.findByText('My payout identity')).toBeInTheDocument()
      expect(screen.queryByText('owner.dash')).toBeNull()
    } finally {
      remove()
    }
  })
})
