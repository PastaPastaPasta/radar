import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { TxTypeBadge } from './TxTypeBadge'

const badge = async (node: React.ReactNode, at = '/') => {
  const { container } = await renderInRouter(<I18nProvider i18n={i18n}>{node}</I18nProvider>, at)
  return container.querySelector('[data-type]') ?? container.querySelector('.dh-badge')
}

describe('TxTypeBadge', () => {
  it('calls an address-list mix CoinJoin by its total and zero fee', async () => {
    const row = { txType: 'normal', valueOut: 5_000_050n, fee: 0n }
    const el = await badge(<TxTypeBadge type="normal" row={row} />)
    expect(el).toHaveAttribute('data-type', 'coinjoin')
    expect(el).toHaveTextContent('CoinJoin')
    expect(el?.closest('[data-inferred]')).toHaveAttribute(
      'title',
      expect.stringContaining('inferred from the transaction’s total and zero fee'),
    )
  })

  it('calls ten 0.100001 DASH coins with no fee CoinJoin', async () => {
    const row = { txType: 'normal', valueOut: 1_000_010n * 10n * 10n, fee: 0n }
    expect(await badge(<TxTypeBadge type="normal" row={row} />)).toHaveAttribute(
      'data-type',
      'coinjoin',
    )
  })

  it('keeps a payment that pays a fee a payment', async () => {
    const row = { txType: 'normal', valueOut: 5_000_050n, fee: 2_260n }
    expect(await badge(<TxTypeBadge type="normal" row={row} />)).toHaveAttribute(
      'data-type',
      'transfer',
    )
  })

  it('needs three mixed coins on mainnet but two on testnet', async () => {
    const row = { txType: 'normal', valueOut: 200_002n, fee: 0n }
    expect(await badge(<TxTypeBadge type="normal" row={row} />)).toHaveAttribute(
      'data-type',
      'transfer',
    )
    expect(
      await badge(<TxTypeBadge type="normal" row={row} />, '/?network=testnet'),
    ).toHaveAttribute('data-type', 'coinjoin')
  })
})
