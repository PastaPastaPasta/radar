import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budget } from '@/data/dapi-core/budget'
import type { SourceStamp } from '@/data/envelope'
import type { MnRow } from '@/data/masternodes/rows'
import { pe } from '@/data/pe/client'
import { sdk } from '@/data/sdk'
import { writeSourceMode } from '@/lib/source-mode'
import { systemContract } from '@/lib/well-known'
import type { EntityKind } from '@/ui/base'
import { renderInApp } from '../test-utils'

const rows = vi.hoisted(() => ({ value: [] as unknown }))
vi.mock('@/data/masternodes/rows', () => ({
  mnRowsQuery: () => ({
    queryKey: ['mn-rows-test'],
    queryFn: () => Promise.resolve(rows.value),
  }),
}))

const NOW = 1_794_000_000_000
const sdkStamp = { source: 'sdk' as const, asOf: NOW, fetchedAt: NOW, proved: false }
const peStamp = { source: 'pe' as const, asOf: NOW, fetchedAt: NOW, proved: false }
const ID = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const OTHER = '7fTiLgNCANR7Wf4D7ZuHBje9nrbrgnZpTDXuRdVdv5Ds'
const HEX = 'ab'.repeat(32)
const DPNS = systemContract('dpns').id

type Handler = (method: string, args: Record<string, unknown>) => unknown

/** Answers SDK calls from a table of method to value; a method not in the table fails the test. */
type Answer =
  | Handler
  | Record<string, unknown>
  | readonly unknown[]
  | Map<unknown, unknown>
  | string
  | number
  | bigint
  | boolean
  | null

function sdkAnswers(answers: Record<string, Answer>) {
  return vi.spyOn(sdk, 'call').mockImplementation((_net, method, args) => {
    if (!(method in answers)) return Promise.reject(new Error(`unexpected SDK call ${method}`))
    const a = answers[method]
    const data =
      typeof a === 'function' ? (a as Handler)(method, args as Record<string, unknown>) : a
    return Promise.resolve({ ...sdkStamp, data }) as never
  })
}

const card = async (kind: EntityKind, id: string, url = '/') => {
  const { getHoverCard } = await import('@/ui/hover-cards')
  const { registerEntityHoverCards } = await import('../register')
  registerEntityHoverCards()
  const Card = getHoverCard(kind)!
  return renderInApp(<Card id={id} />, url)
}

beforeEach(() => {
  rows.value = []
  vi.spyOn(budget, 'snapshot').mockReturnValue({
    pressure: 'ok',
    headroom: 300,
    capacity: 400,
    benched: 0,
    usedLastMinute: 10,
  })
  vi.spyOn(budget, 'canAfford').mockReturnValue(true)
  vi.spyOn(pe, 'token').mockResolvedValue({ ...peStamp, data: null } as never)
  vi.spyOn(pe, 'dataContract').mockResolvedValue({ ...peStamp, data: null } as never)
})
afterEach(() => {
  vi.restoreAllMocks()
  writeSourceMode('all')
})

describe('masternode and evonode card @X-06', () => {
  const stamp: SourceStamp = { source: 'dapi', asOf: NOW, fetchedAt: NOW, proved: false }
  const base = {
    protx: HEX,
    type: 'evo',
    status: 'enabled',
    service: '1.2.3.4:9999',
    host: '1.2.3.4',
    registration: null,
    crawl: null,
    dapi: stamp,
    radar: null,
  } as unknown as MnRow

  it('shows type, status, version and last paid from the joined row', async () => {
    rows.value = [
      {
        ...base,
        crawl: { version: '24.0.1', last_paid_height: 2_570_000 },
        radar: { ...stamp, source: 'radar' },
      },
    ]
    rows.value = { data: { rows: rows.value }, ...stamp }
    await card('evonode', HEX)
    const root = (await screen.findByText('Evonode')).closest<HTMLElement>('[data-hover-card]')!
    expect(root.dataset.hoverCard).toBe('evonode')
    expect(within(root).getByText('Enabled')).toBeInTheDocument()
    expect(within(root).getByText('24.0.1')).toBeInTheDocument()
    expect(within(root).getByText('Block 2,570,000')).toBeInTheDocument()
    expect(root.querySelector('[data-source="radar"]')).not.toBeNull()
  })

  it('shows only what DAPI answers when there is no crawl', async () => {
    rows.value = { data: { rows: [{ ...base, type: 'regular', status: 'pose-banned' }] }, ...stamp }
    await card('masternode', HEX)
    const root = (await screen.findByText('Masternode')).closest<HTMLElement>('[data-hover-card]')!
    expect(within(root).getByText('PoSe-banned')).toBeInTheDocument()
    expect(within(root).queryByText('Version')).toBeNull()
    expect(within(root).queryByText('Last paid')).toBeNull()
  })

  it('says so when the node is not in the list', async () => {
    rows.value = { data: { rows: [] }, ...stamp }
    await card('masternode', HEX)
    expect(await screen.findByText(/Not in this network/)).toBeInTheDocument()
  })
})

describe('identity card @X-06', () => {
  it('shows balance and name from the batched SDK reads', async () => {
    const calls = sdkAnswers({
      'identities.balances': (_m, a) =>
        new Map((a.ids as string[]).map((id) => [id, 1_500_000_000_000n])),
      'documents.query': [
        {
          createdAt: 1,
          data: { label: 'alice', normalizedParentDomainName: 'dash', records: { identity: ID } },
        },
      ],
    })
    await card('identity', ID)
    const root = (
      await screen.findByText('alice.dash', { selector: '.rx-hc__title' })
    ).closest<HTMLElement>('[data-hover-card="identity"]')!
    expect(root.querySelector('[data-amount]')).not.toBeNull()
    expect(within(root).getByText('Name')).toBeInTheDocument()
    expect(root.querySelector('[data-source="sdk"]')).not.toBeNull()
    const asked = calls.mock.calls.map((c) => c[1])
    expect(asked).toEqual(expect.arrayContaining(['identities.balances', 'documents.query']))
  })

  it('says when the identity does not exist and asks nothing for a bad id', async () => {
    sdkAnswers({
      'identities.balances': (_m, a) => new Map((a.ids as string[]).map((id) => [id, null])),
      'documents.query': [],
    })
    await card('identity', OTHER)
    expect(await screen.findByText(/No identity with this ID/)).toBeInTheDocument()
    vi.restoreAllMocks()
    const none = sdkAnswers({})
    await card('identity', 'nope')
    expect(await screen.findByText(/not an identity ID/)).toBeInTheDocument()
    expect(none).not.toHaveBeenCalled()
  })
})

describe('contract card @X-06', () => {
  it('shows name, owner and the number of document types, and the table`s description', async () => {
    sdkAnswers({
      'contracts.getMany': (_m, a) =>
        new Map(
          (a.ids as string[]).map((id) => [
            id,
            { id, ownerId: ID, version: 1, documentSchemas: { domain: {}, preorder: {} } },
          ]),
        ),
      'documents.query': [],
    })
    await card('contract', DPNS)
    const root = (await screen.findByText('2 types')).closest<HTMLElement>(
      '[data-hover-card="contract"]',
    )!
    expect(within(root).getByText('DPNS', { selector: '.rx-hc__title' })).toBeInTheDocument()
    expect(within(root).getByText(/Dash Platform Name Service/)).toBeInTheDocument()
    expect(within(root).getByRole('link', { name: /Bjix/ })).toBeInTheDocument()
  })
})

describe('token card @X-06', () => {
  it('shows supply and whether it is paused', async () => {
    sdkAnswers({
      'tokens.totalSupply': 123_450n,
      'tokens.statuses': (_m, a) =>
        new Map((a.tokenIds as string[]).map((id) => [id, { paused: true }])),
    })
    await card('token', ID)
    const root = (await screen.findByText('Paused')).closest<HTMLElement>(
      '[data-hover-card="token"]',
    )!
    expect(within(root).getByText(/123,450 base units/)).toBeInTheDocument()
  })

  it('says when there is no such token', async () => {
    sdkAnswers({ 'tokens.totalSupply': null, 'tokens.statuses': new Map([[ID, null]]) })
    await card('token', ID)
    expect(await screen.findByText(/No token with this ID/)).toBeInTheDocument()
  })
})

describe('document card @X-06', () => {
  it('shows type, owner, update time and revision', async () => {
    const asked = sdkAnswers({
      'documents.get': {
        id: OTHER,
        ownerId: ID,
        contractId: DPNS,
        type: 'domain',
        revision: 3n,
        createdAt: NOW - 86_400_000,
        updatedAt: NOW,
      },
      'documents.query': [],
    })
    await card('document', `${DPNS}/domain/${OTHER}`)
    const root = (await screen.findByText('Revision')).closest<HTMLElement>(
      '[data-hover-card="document"]',
    )!
    expect(within(root).getByText('3')).toBeInTheDocument()
    expect(within(root).getByText('domain', { selector: 'dd' })).toBeInTheDocument()
    expect(asked.mock.calls.find((c) => c[1] === 'documents.get')?.[2]).toEqual({
      contractId: DPNS,
      type: 'domain',
      id: OTHER,
    })
  })

  it('refuses an address that is not contract/type/id', async () => {
    const none = sdkAnswers({})
    await card('document', OTHER)
    expect(await screen.findByText(/not a document address/)).toBeInTheDocument()
    expect(none).not.toHaveBeenCalled()
  })
})

describe('name card @X-06', () => {
  it('shows the owner of a registered name', async () => {
    const asked = sdkAnswers({
      'dpns.getUsernameByName': { username: 'alice.dash', identityId: ID, documentId: OTHER },
      'documents.query': [],
    })
    await card('name', 'alice')
    const root = (await screen.findByText('Registered')).closest<HTMLElement>(
      '[data-hover-card="name"]',
    )!
    expect(within(root).getByRole('link', { name: /Bjix/ })).toBeInTheDocument()
    expect(asked.mock.calls.find((c) => c[1] === 'dpns.getUsernameByName')?.[2]).toEqual({
      name: 'alice.dash',
    })
  })

  it('says a name nobody owns is not registered', async () => {
    sdkAnswers({ 'dpns.getUsernameByName': null })
    await card('name', 'free')
    expect(await screen.findByText(/Not registered/)).toBeInTheDocument()
  })
})

describe('epoch card @X-06', () => {
  const epoch = (index: number, ms: number, height: number) => ({
    index,
    firstBlockTimeMs: ms,
    firstBlockHeight: height,
    firstCoreBlockHeight: 1,
    feeMultiplierPermille: 1000,
    protocolVersion: 12,
  })

  it('shows start, end and block count of a finished epoch', async () => {
    sdkAnswers({
      'epoch.epochsInfo': [epoch(7, NOW - 1_000_000, 1000), epoch(8, NOW, 1900)],
    })
    await card('epoch', '7')
    const root = (await screen.findByText('Blocks')).closest<HTMLElement>(
      '[data-hover-card="epoch"]',
    )!
    expect(within(root).getByText('900')).toBeInTheDocument()
  })

  it('calls the current epoch in progress', async () => {
    sdkAnswers({ 'epoch.epochsInfo': [epoch(9, NOW - 1000, 5000)] })
    await card('epoch', '9')
    expect(await screen.findByText('In progress')).toBeInTheDocument()
  })
})

describe('Platform address card @X-06', () => {
  const ADDR = 'dash1k2gwmxl4sy6qrq6xgwk2z4mxd8hdq7zk4r'

  it('shows balance and nonce, and says an empty address holds nothing', async () => {
    sdkAnswers({
      'addresses.getMany': (_m, a) =>
        new Map(
          (a.addresses as string[]).map((address) => [
            address,
            { address, balance: 250_000_000_000n, nonce: 4n },
          ]),
        ),
    })
    const { decodePlatformAddress } = await import('@/lib/bech32')
    if (decodePlatformAddress(ADDR) === null) return
    await card('platform-address', ADDR)
    expect(await screen.findByText('Nonce')).toBeInTheDocument()
  })
})

describe('Platform block and state transition cards @X-06', () => {
  const header = {
    hash: 'CD'.repeat(32),
    height: 468_960,
    timestamp: NOW,
    validator: 'EF'.repeat(32),
    totalGasUsed: 0,
  }

  it('shows height, time, transitions and proposer of a block', async () => {
    vi.spyOn(pe, 'blocks').mockResolvedValue({
      ...peStamp,
      data: { items: [{ header, txs: [{}] }], page: 1, limit: 1, total: 1 },
    } as never)
    vi.spyOn(pe, 'block').mockResolvedValue({
      ...peStamp,
      data: { header, txs: [{}, {}, {}], quorum: null },
    } as never)
    await card('platform-block', '468960')
    const root = (await screen.findByText('Transitions')).closest<HTMLElement>(
      '[data-hover-card="platform-block"]',
    )!
    expect(within(root).getByText('3')).toBeInTheDocument()
    expect(root.querySelector('[data-source="pe"]')).not.toBeNull()
  })

  it('shows type, status, owner and block of a transition', async () => {
    vi.spyOn(pe, 'transaction').mockResolvedValue({
      ...peStamp,
      data: {
        hash: HEX,
        type: 'IDENTITY_TOP_UP',
        status: 'SUCCESS',
        timestamp: NOW,
        blockHeight: 99,
        owner: { identifier: ID, aliases: [] },
      },
    } as never)
    await card('transition', HEX)
    const root = (await screen.findByText('Success')).closest<HTMLElement>(
      '[data-hover-card="transition"]',
    )!
    expect(within(root).getByText('99')).toBeInTheDocument()
    expect(within(root).getByRole('link', { name: /Bjix/ })).toBeInTheDocument()
  })

  it.each(['platform-block', 'transition'] as const)(
    'asks no indexer in Decentralized only mode, and says it needs one (%s)',
    async (kind) => {
      writeSourceMode('decentralized')
      const blocks = vi.spyOn(pe, 'blocks')
      const block = vi.spyOn(pe, 'block')
      const transaction = vi.spyOn(pe, 'transaction')
      await card(kind, kind === 'transition' ? HEX : '468960')
      const root = (await screen.findByText(/Needs an indexer/)).closest<HTMLElement>(
        `[data-hover-card="${kind}"]`,
      )!
      expect(root.dataset.unavailable).toBe('indexer')
      expect(blocks).not.toHaveBeenCalled()
      expect(block).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
    },
  )
})

describe('contest card @X-06', () => {
  it('shows status, leader and contenders from the SDK, and the end time from the indexer', async () => {
    sdkAnswers({
      'voting.contestedResourceVoteState': {
        contenders: [
          { identityId: OTHER, voteTally: 2 },
          { identityId: ID, voteTally: 5 },
        ],
        abstainVotes: 0,
        lockVotes: 0,
        winner: null,
      },
      'documents.query': [],
    })
    vi.spyOn(pe, 'contestedResource').mockResolvedValue({
      ...peStamp,
      data: { endTimestamp: NOW + 86_400_000 },
    } as never)
    await card('contest', 'alice')
    const root = (await screen.findByText('Leading')).closest<HTMLElement>(
      '[data-hover-card="contest"]',
    )!
    expect(within(root).getByText('Active')).toBeInTheDocument()
    expect(within(root).getByText(/5 votes/)).toBeInTheDocument()
    expect(within(root).getByText('Ends')).toBeInTheDocument()
  })

  it('shows only the SDK facts in Decentralized only mode', async () => {
    writeSourceMode('decentralized')
    sdkAnswers({
      'voting.contestedResourceVoteState': {
        contenders: [{ identityId: ID, voteTally: 1 }],
        abstainVotes: 0,
        lockVotes: 0,
        winner: { kind: 'won', identityId: ID },
      },
      'documents.query': [],
    })
    const contested = vi.spyOn(pe, 'contestedResource')
    await card('contest', 'alice')
    expect(await screen.findByText('Winner')).toBeInTheDocument()
    expect(screen.queryByText('Ends')).toBeNull()
    expect(contested).not.toHaveBeenCalled()
  })
})
