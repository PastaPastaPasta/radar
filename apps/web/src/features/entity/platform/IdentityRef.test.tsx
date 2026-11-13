import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderInApp } from '../test-utils'
import { OWNER } from './fixtures'
import { IdentityRef } from './IdentityRef'

describe('IdentityRef', () => {
  it('links to the identity with its identicon, on the page’s network', async () => {
    await renderInApp(<IdentityRef id={OWNER} />, '/?network=testnet')
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `/identity/${OWNER}?network=testnet`)
    expect(link.querySelector('[data-art="identicon"]')).not.toBeNull()
  })

  it('shows the label it is given in place of the identifier', async () => {
    await renderInApp(<IdentityRef id={OWNER} label="alice.dash" size="sm" />)
    expect(screen.getByRole('link', { name: /alice/ })).toBeInTheDocument()
    expect(screen.getByText('alice.dash')).toBeInTheDocument()
  })
})
