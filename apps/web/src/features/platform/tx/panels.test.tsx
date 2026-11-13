import { screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { StateTransitionDecodedDto } from '@/data/sdk/methods/p-blocks'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { TypePanel } from './panels'

const renderInApp = (node: ReactNode) =>
  renderInRouter(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>{node}</I18nProvider>
    </QueryClientProvider>,
  )

const ID = '5AqJsC1a1VwgpQBnXJaAwVfyAd7PN1miSQg1gEkMKhRt'
const OTHER = '7P3ZsJHh61jhvVwaxh1xyNx7wkCqiDdkhw2EpCfTn9J'
const CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

const dto = (typeNumber: number, body: unknown): StateTransitionDecodedDto => ({
  actionType: 'x',
  typeNumber,
  userFeeIncrease: 0,
  hash: '00',
  body,
})

describe('TypePanel', () => {
  it('shows a credit transfer’s sender, recipient and amount', async () => {
    const { container } = await renderInApp(
      <TypePanel
        net="mainnet"
        decoded={dto(7, { identityId: ID, recipientId: OTHER, amount: 100_000_000_000 })}
      />,
    )
    expect(container.querySelector(`[data-entity="identity"][data-id="${ID}"]`)).not.toBeNull()
    expect(container.querySelector(`[data-entity="identity"][data-id="${OTHER}"]`)).not.toBeNull()
    expect(screen.getByText('From')).toBeInTheDocument()
    expect(screen.getByText('To')).toBeInTheDocument()
  })

  it('shows each action of a batch with its document or token', async () => {
    const { container } = await renderInApp(
      <TypePanel
        net="mainnet"
        decoded={dto(1, {
          ownerId: ID,
          transitions: [
            {
              $transition: 'document',
              $action: 'create',
              $id: 'DOC1',
              $type: 'note',
              $dataContractId: CONTRACT,
            },
            {
              $transition: 'token',
              $action: 'mint',
              $tokenId: 'TOK1',
              $dataContractId: CONTRACT,
              amount: 5,
              issuedToIdentityId: null,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('Action 1')).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
    expect(
      container.querySelector(`[data-entity="document"][data-id="${CONTRACT}/note/DOC1"]`),
    ).not.toBeNull()
    expect(container.querySelector('[data-entity="token"][data-id="TOK1"]')).not.toBeNull()
  })

  it('names the evonode, the poll and the choice of a masternode vote', async () => {
    const proTx = '001cb9381b08d784f4c1e1e220906874ea9e88f7124ebdf8baf0782007afad4f'
    const { base58Encode } = await import('@/lib/base58')
    const bytes = Uint8Array.from(proTx.match(/../g)!.map((b) => parseInt(b, 16)))
    const { container } = await renderInApp(
      <TypePanel
        net="mainnet"
        decoded={dto(8, {
          proTxHash: base58Encode(bytes),
          voterIdentityId: ID,
          vote: {
            votePoll: {
              contractId: CONTRACT,
              documentTypeName: 'domain',
              indexName: 'parentNameAndLabel',
              indexValues: ['dash', 'alice'],
            },
            resourceVoteChoice: { $type: 'towardsIdentity', identity: OTHER },
          },
        })}
      />,
    )
    expect(container.querySelector(`[data-entity="evonode"][data-id="${proTx}"]`)).not.toBeNull()
    const poll = container.querySelector('[data-entity="contest"]')
    expect(poll).not.toBeNull()
    const link = poll?.matches('a') ? poll : poll?.querySelector('a')
    expect(link?.getAttribute('href')).toContain('index=parentNameAndLabel')
    expect(container.querySelector(`[data-entity="identity"][data-id="${OTHER}"]`)).not.toBeNull()
  })

  it('lists the inputs and outputs of an address transfer with Platform addresses', async () => {
    const hex = `00${'ab'.repeat(20)}`
    const { container } = await renderInApp(
      <TypePanel
        net="mainnet"
        decoded={dto(12, {
          inputs: [{ address: hex, nonce: 4, amount: 10 }],
          outputs: [{ address: `01${'cd'.repeat(20)}`, amount: 9 }],
          feeStrategy: [{ $type: 'deductFromInput', index: 0 }],
        })}
      />,
    )
    expect(container.querySelectorAll('[data-entity="platform-address"]')).toHaveLength(2)
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(within(tables[0]!).getByText('4')).toBeInTheDocument()
    expect(screen.getByText('deduct from input 0')).toBeInTheDocument()
  })

  it('falls back to the field tree for a type with no layout, and shows nothing without a body', async () => {
    const { container } = await renderInApp(<TypePanel net="mainnet" decoded={dto(23, { a: 1 })} />)
    expect(container.textContent).toContain('"a"')
    const empty = await renderInApp(<TypePanel net="mainnet" decoded={dto(23, null)} />)
    expect(empty.container.textContent).toBe('')
  })
})
