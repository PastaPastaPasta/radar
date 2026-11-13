import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Amount, UnitsProvider } from '@/ui'

describe('Platform amounts carry a USD estimate @PE-37', () => {
  const credits = 1_013_248_617_912n

  it('prices credits at the DASH rate, to three significant figures', () => {
    const { container } = render(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: false }}>
        <Amount value={credits} kind="credits" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-amt')).toHaveTextContent('10.1325 DASH')
    expect(container.querySelector('.rx-fiat')).toHaveTextContent('≈ $468')
  })

  it('has no estimate on testnet or before the rate is known', () => {
    const { container, rerender } = render(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: true }}>
        <Amount value={credits} kind="credits" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toBeNull()
    rerender(
      <UnitsProvider value={{ unit: 'DASH', testnet: false }}>
        <Amount value={credits} kind="credits" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toBeNull()
  })

  it('prices small credit amounts too', () => {
    const { container } = render(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: false }}>
        <Amount value={100_000n} kind="credits" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toHaveTextContent(/≈ \$0\.0\d+/)
  })
})
