import type { RouteCase, RouteNet } from './types'

/** A masternode page's h1: "Masternode" until a record names it, then its host and port. */
export const masternodeH1 = (net: RouteNet): RegExp =>
  new RegExp(`^(Masternode|${M1_RECORDS[net].mnHost.replaceAll('.', '\\.')}(:\\d+)?)$`)

interface Records {
  blockHash: string
  height: string
  date: string
  tx: string
  address: string
  proposal: string
  protx: string
  /** The masternode's host: the page's h1 once Radar answered; in the mode the h1 stays "Masternode". */
  mnHost: string
}

export const M1_RECORDS: Record<RouteNet, Records> = {
  mainnet: {
    blockHash: '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6',
    height: '2569992',
    date: '2026-11-03',
    tx: '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90',
    address: 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14',
    proposal: '0f44c3013cb2703ba00b226457189374c8881f855ec1232b24251fe039d6159c',
    protx: '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32',
    mnHost: '85.209.241.228',
  },
  testnet: {
    blockHash: '000000b1dbd02a45fcda1f664e6b8ab5986fc3fba9c449d523927a086ad76a54',
    height: '1589232',
    date: '2026-11-03',
    tx: '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6',
    address: 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa',
    proposal: '01934d6d5c25ade531176a0283148b3d6aeaef2c0b6d599552e43c2199d2f8cd',
    protx: '51238bb9e2b68fc822e8eb15d415e97ebc86f769a72c15e0a6e25d9ea8d38475',
    mnHost: '62.60.244.174',
  },
}

/** A block's transactions: a table of links on desktop, a list of rows that open on a phone. */
const BLOCK_TXS = 'a[href^="/tx/"], [aria-label^="Transactions in block"] button'

function m1(net: RouteNet): RouteCase[] {
  const r = M1_RECORDS[net]
  const nets = [net]
  const built = true as const
  return [
    { path: '/', h1: 'Radar', nets, built, decentralized: 'partial', data: '[data-headline]' },
    {
      path: '/blocks',
      h1: 'Blocks',
      nets,
      built,
      decentralized: 'data',
      data: 'a[href^="/block/"]',
    },
    {
      path: `/blocks?date=${r.date}`,
      h1: 'Blocks',
      nets,
      built,
      decentralized: 'data',
      data: 'a[href^="/block/"]',
    },
    {
      path: `/block/${r.blockHash}`,
      h1: 'Block',
      nets,
      built,
      decentralized: 'data',
      data: BLOCK_TXS,
    },
    {
      path: `/block/${r.height}`,
      h1: 'Block',
      nets,
      built,
      decentralized: 'data',
      data: BLOCK_TXS,
    },
    {
      path: `/tx/${r.tx}`,
      h1: 'Transaction',
      nets,
      built,
      decentralized: 'partial',
      data: '#io',
    },
    {
      path: `/address/${r.address}`,
      h1: 'Address',
      nets,
      built,
      decentralized: 'partial',
      data: '[data-live]',
    },
    {
      path: '/mempool',
      h1: 'Mempool',
      nets,
      built,
      decentralized: 'partial',
      data: '[data-mempool-view="seen"]',
    },
    { path: '/rich-list', h1: 'Rich list', nets, built, decentralized: 'unavailable' },
    { path: '/charts', h1: 'Charts', nets, built, decentralized: 'unavailable' },
    { path: '/internals', h1: 'Network internals', nets, built, decentralized: 'unavailable' },
    { path: '/governance', h1: 'Governance', nets, built, decentralized: 'unavailable' },
    {
      path: `/governance/${r.proposal}`,
      h1: 'Proposal',
      nets,
      built,
      decentralized: 'unavailable',
    },
    {
      path: '/sources',
      h1: 'Data sources',
      nets,
      built,
      decentralized: 'data',
      data: '[data-backend="dapi"]',
    },
    { path: '/tools/verify-message', h1: 'Verify message', nets, built, decentralized: 'data' },
    { path: '/tools/qr', h1: 'QR reader', nets, built, decentralized: 'data' },
  ]
}

export const m1Routes: RouteCase[] = [...m1('mainnet'), ...m1('testnet')]
