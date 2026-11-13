import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { writeSourceMode } from '@/lib/source-mode'
import { classify } from '../classify'
import type { ResolverContext, SearchHit } from '../types'
import { mergeHits } from '../useSearch'
import { sdkEpoch } from './epoch'
import { heights } from './height'
import { pePlatformBlock } from './platform-block'
import { peSearch } from './pe-search'
import { dapiMasternode } from './dapi-masternode'
import { sdkDpnsName } from './sdk-dpns-name'
import { sdkContract, sdkDocument, sdkIdentity, sdkToken } from './sdk-entities'
import { sdkTransition } from './sdk-transition'
import { wellKnown } from './well-known'
import { homographSafe, localStamp } from './helpers'

const MN = vi.hoisted(() => ({
  regular: {
    proRegTxHash: '9c663ed039e98d055af0e1dbd30a7b702e77fce302708114915cf2ede9f85874',
    service: '146.190.33.135:9999',
    isValid: true,
    type: 0,
  },
  evo: {
    proRegTxHash: 'b5c4d7bba1b11f98497c419c4d81b72a525fe30ae788028c570dd4eb77255e77',
    service: '46.62.250.247:9999',
    isValid: false,
    type: 1,
  },
}))

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const list = new Map(Object.values(MN).map((m) => [m.proRegTxHash, { ...m }]))
  return {
    ...actual,
    core: {
      ...actual.core,
      masternodeList: () =>
        Promise.resolve({
          source: 'dapi',
          asOf: 1,
          fetchedAt: 1,
          proved: false,
          data: list,
        }),
    },
  }
})

const ID = {
  identity: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  contract: 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR',
  dpns: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  token: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB',
  absent: '11111111111111111111111111111111',
  document: 'FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS',
  pblock: '4f714d46d5ff9d219be0776fb02db4bad11e003450d30093a4cc21a33afbbcfe',
  ptx: '5711c785cbc88a13d5404979d2fc811cf09b24aeb37f5667127231176a0a0765',
}

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  net: 'mainnet',
  signal: new AbortController().signal,
  ...over,
})

describe('chain tips narrow the number resolvers', () => {
  it('offers a Platform block and an epoch only inside the tips, and none of them in Decentralized only mode @X-01 @NX-05', async () => {
    const tip = { core: 2_570_010, platform: 468_967, epoch: 88 }
    const small = await heights.resolve(classify('86', 'mainnet', tip), ctx({ tip }))
    expect(small.map((h) => h.kind)).toEqual(['block', 'platform-block', 'epoch'])

    const mid = await heights.resolve(classify('2569992', 'mainnet', tip), ctx({ tip }))
    expect(mid.map((h) => h.kind)).toEqual(['block'])

    writeSourceMode('decentralized')
    const off = await heights.resolve(classify('86', 'mainnet', tip), ctx({ tip }))
    expect(off.map((h) => h.kind)).toEqual(['block', 'epoch'])
  })

  it('offers neither before a tip is known @NX-05', async () => {
    const hits = await heights.resolve(classify('86', 'mainnet'), ctx())
    expect(hits.map((h) => h.kind)).toEqual(['block'])
  })
})

describe('sdk-epoch', () => {
  it('reads an epoch proof-checked when no tip is known @X-01', async () => {
    const hits = await sdkEpoch.resolve(classify('86', 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'epoch',
      id: '86',
      title: 'Epoch 86',
      href: { to: '/epoch/$n', params: { n: '86' } },
      rank: 100,
    })
    expect(hits[0]?.stamp.proved).toBe(true)
  })

  it('leaves an epoch inside the tip to the plain link, and one past it to nothing @X-01', async () => {
    const tip = { epoch: 88 }
    expect(await sdkEpoch.resolve(classify('86', 'mainnet', tip), ctx({ tip }))).toEqual([])
    expect(await sdkEpoch.resolve(classify('999999', 'mainnet'), ctx())).toEqual([])
  })

  it('waits for the tip to be read and claims only numbers @X-01', () => {
    expect(sdkEpoch.waitsForTip).toBe(true)
    expect(sdkEpoch.accepts).toEqual(['int'])
  })
})

describe('pe-platform-block', () => {
  it('confirms a height Platform Explorer has when no tip is known @X-01', async () => {
    const hits = await pePlatformBlock.resolve(classify('468967', 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'platform-block',
      id: '468967',
      href: { to: '/platform/block/$id', params: { id: '468967' } },
      rank: 100,
    })
    expect(hits[0]?.stamp.source).toBe('pe')
  })

  it('has no block above the chain, and asks nothing once the tip says so or the mode forbids it @X-01 @NX-05', async () => {
    expect(await pePlatformBlock.resolve(classify('999999999', 'mainnet'), ctx())).toEqual([])
    const tip = { platform: 468_967 }
    expect(await pePlatformBlock.resolve(classify('468967', 'mainnet', tip), ctx({ tip }))).toEqual(
      [],
    )
    writeSourceMode('decentralized')
    expect(await pePlatformBlock.resolve(classify('468967', 'mainnet'), ctx())).toEqual([])
  })
})

describe('SDK entity resolvers', () => {
  it('finds an identity by base58 ID and by hex, with the name it holds @X-01 @NX-05', async () => {
    const hits = await sdkIdentity.resolve(classify(ID.identity, 'mainnet'), ctx())
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'identity',
      id: ID.identity,
      title: 'pshenmic.dash',
      href: { to: '/identity/$id', params: { id: ID.identity } },
      rank: 100,
    })
    expect(hits[0]?.stamp).toMatchObject({ source: 'sdk', proved: true })
  })

  it('finds nothing for an ID no identity has @NX-05', async () => {
    expect(await sdkIdentity.resolve(classify(ID.contract, 'mainnet'), ctx())).toEqual([])
  })

  it('finds a contract through the contract batcher @X-01 @NX-05', async () => {
    const hits = await sdkContract.resolve(classify(ID.contract, 'mainnet'), ctx())
    expect(hits[0]).toMatchObject({
      kind: 'contract',
      id: ID.contract,
      href: { to: '/contract/$id', params: { id: ID.contract } },
      rank: 100,
    })
    expect(hits[0]?.stamp.proved).toBe(true)
    expect(await sdkContract.resolve(classify(ID.identity, 'mainnet'), ctx())).toEqual([])
  })

  it('names a well-known contract by its proper name @X-01', async () => {
    const hits = await sdkContract.resolve(classify(ID.dpns, 'mainnet'), ctx())
    expect(hits[0]?.title).toBe('DPNS')
  })

  it('finds a token and says which contract holds it @X-01 @NX-05', async () => {
    const hits = await sdkToken.resolve(classify(ID.token, 'mainnet'), ctx())
    expect(hits[0]).toMatchObject({
      kind: 'token',
      id: ID.token,
      href: { to: '/token/$id', params: { id: ID.token } },
      rank: 100,
    })
    expect(JSON.stringify(hits[0]?.subtitle)).toContain('position 0')
    expect(await sdkToken.resolve(classify(ID.identity, 'mainnet'), ctx())).toEqual([])
  })

  it('finds a document only from a contract/type/ID paste @X-01 @NX-05', async () => {
    const paste = `${ID.dpns}/domain/${ID.document}`
    const c = classify(paste, 'mainnet')
    expect(c.classes).toEqual(['document-path'])
    const hits = await sdkDocument.resolve(c, ctx())
    expect(hits[0]).toMatchObject({
      kind: 'document',
      id: paste,
      href: {
        to: '/document/$contract/$type/$id',
        params: { contract: ID.dpns, type: 'domain', id: ID.document },
      },
    })
    const none = await sdkDocument.resolve(
      classify(`${ID.dpns}/domain/CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t`, 'mainnet'),
      ctx(),
    )
    expect(none).toEqual([])
  })

  it('does not claim a bare ID for a document @NX-05', () => {
    expect(sdkDocument.accepts).toEqual(['document-path'])
    expect(classify(ID.document, 'mainnet').classes).toEqual(['base58-id'])
  })
})

describe('sdk-dpns-name', () => {
  it('confirms a registered name and lists the names that begin with it @X-01 @NX-05', async () => {
    const hits = await sdkDpnsName.resolve(classify('pshenmic.dash', 'mainnet'), ctx())
    const exact = hits.find((h) => h.rank === 80)
    expect(exact).toMatchObject({
      kind: 'name',
      id: 'pshenmic',
      title: 'pshenmic.dash',
      href: { to: '/name/$label', params: { label: 'pshenmic' } },
    })
    expect(exact?.stamp.proved).toBe(true)
    expect(hits.every((h) => h.kind === 'name')).toBe(true)
  })

  it('finds nothing for a name nobody holds @NX-05', async () => {
    expect(await sdkDpnsName.resolve(classify('radarfx44661899', 'mainnet'), ctx())).toEqual([])
  })

  it('looks a name up as typed, and converts it itself where the index needs the safe form @NX-05', () => {
    expect(homographSafe('Pshenmic')).toBe('pshenm1c')
    expect(homographSafe('Olli')).toBe('0111')
  })

  it('does not read digits alone, or a date, as a name @NX-05', async () => {
    expect(await sdkDpnsName.resolve(classify('2569992', 'mainnet'), ctx())).toEqual([])
    expect(await sdkDpnsName.resolve(classify('2026-10-01', 'mainnet'), ctx())).toEqual([])
    expect(await peSearch.resolve(classify('2026-10-01', 'mainnet'), ctx())).toEqual([])
  })
})

describe('Decentralized only lookups', () => {
  beforeEach(() => {
    writeSourceMode('decentralized')
  })

  it('finds a ProTx and a service address in the DAPI masternode list @NX-05', async () => {
    const byHash = await dapiMasternode.resolve(classify(MN.regular.proRegTxHash, 'mainnet'), ctx())
    expect(byHash[0]).toMatchObject({
      kind: 'masternode',
      id: MN.regular.proRegTxHash,
      href: { to: '/mn/$protx', params: { protx: MN.regular.proRegTxHash } },
      rank: 100,
    })
    expect(byHash[0]?.stamp.source).toBe('dapi')

    const byIp = await dapiMasternode.resolve(classify('46.62.250.247', 'mainnet'), ctx())
    expect(byIp[0]).toMatchObject({ kind: 'evonode', id: MN.evo.proRegTxHash })
    expect(await dapiMasternode.resolve(classify('46.62.250.247:1', 'mainnet'), ctx())).toEqual([])
  })

  it('stays out of the way when Radar answers @NX-05', async () => {
    writeSourceMode('all')
    expect(
      await dapiMasternode.resolve(classify(MN.regular.proRegTxHash, 'mainnet'), ctx()),
    ).toEqual([])
  })

  it('asks a node whether it executed a transition, only when Explorer is refused @NX-05', async () => {
    const hits = await sdkTransition.resolve(classify(ID.ptx, 'mainnet'), ctx())
    expect(hits[0]).toMatchObject({
      kind: 'transition',
      id: ID.ptx,
      href: { to: '/platform/tx/$hash', params: { hash: ID.ptx } },
    })
    writeSourceMode('all')
    expect(await sdkTransition.resolve(classify(ID.ptx, 'mainnet'), ctx())).toEqual([])
  })
})

describe('well-known names', () => {
  it('finds a system contract and a token by name without a network @X-01', async () => {
    const dash = await wellKnown.resolve(classify('dashpay', 'mainnet'), ctx())
    expect(dash[0]).toMatchObject({
      kind: 'contract',
      id: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7',
      title: 'DashPay',
    })
    expect(dash[0]?.stamp.source).toBe('local')
    const token = await wellKnown.resolve(classify('sans', 'mainnet'), ctx())
    expect(token.map((h) => h.kind)).toContain('token')
  })

  it('needs three letters @X-01', async () => {
    expect(await wellKnown.resolve(classify('da', 'mainnet'), ctx())).toEqual([])
  })
})

describe('pe-search', () => {
  it('groups Explorer’s answer by kind, with names and contests from the aliases @X-01 @NX-05', async () => {
    const hits = await peSearch.resolve(classify('quantum', 'mainnet'), ctx())
    const kinds = new Set(hits.map((h) => h.kind))
    expect(kinds).toEqual(new Set(['identity', 'name', 'contest']))
    const name = hits.find((h) => h.kind === 'name' && h.id === 'quantum')
    expect(name).toMatchObject({
      title: 'quantum.dash',
      href: { to: '/name/$label', params: { label: 'quantum' } },
      rank: 80,
    })
    expect(hits.find((h) => h.kind === 'contest' && h.id === 'quantum')).toMatchObject({
      href: { to: '/contest/$label', params: { label: 'quantum' } },
    })
    expect(hits.every((h) => h.stamp.source === 'pe')).toBe(true)
  })

  it('finds contracts by name or keyword and tokens by name @X-01', async () => {
    const contract = await peSearch.resolve(classify('dashpay', 'mainnet'), ctx())
    expect(contract.find((h) => h.kind === 'contract')).toMatchObject({
      id: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7',
      href: { to: '/contract/$id', params: { id: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7' } },
    })
    const token = await peSearch.resolve(classify('sans', 'mainnet'), ctx())
    expect(token.find((h) => h.kind === 'token')).toMatchObject({
      id: ID.token,
      href: { to: '/token/$id', params: { id: ID.token } },
    })
  })

  it('finds a Platform block, a transition and a validator by hash in one request @X-01 @NX-05', async () => {
    const block = await peSearch.resolve(classify(ID.pblock, 'mainnet'), ctx())
    expect(block[0]).toMatchObject({
      kind: 'platform-block',
      id: '468967',
      href: { to: '/platform/block/$id', params: { id: '468967' } },
      rank: 100,
    })
    const tx = await peSearch.resolve(classify(ID.ptx, 'mainnet'), ctx())
    expect(tx[0]).toMatchObject({
      kind: 'transition',
      id: ID.ptx,
      href: { to: '/platform/tx/$hash', params: { hash: ID.ptx } },
    })
    const evo = await peSearch.resolve(classify(MN.evo.proRegTxHash, 'mainnet'), ctx())
    expect(evo[0]).toMatchObject({ kind: 'evonode', id: MN.evo.proRegTxHash })
  })

  it('shows one identity when Explorer and the SDK both found it, stamped proof-checked @NX-05', async () => {
    const c = classify(ID.identity, 'mainnet')
    const [pe, sdk] = await Promise.all([peSearch.resolve(c, ctx()), sdkIdentity.resolve(c, ctx())])
    expect(pe.find((h) => h.kind === 'identity')?.stamp.proved).toBe(false)
    for (const order of [
      [pe, sdk],
      [sdk, pe],
    ]) {
      const merged = mergeHits(order).filter((h) => h.kind === 'identity' && h.id === ID.identity)
      expect(merged).toHaveLength(1)
      expect(merged[0]?.stamp.proved).toBe(true)
    }
  })

  it('shows one hit for a node Hyphen calls a masternode and Explorer calls an evonode @NX-05', () => {
    const hit = (kind: 'masternode' | 'evonode'): SearchHit => ({
      kind,
      id: MN.evo.proRegTxHash,
      title: kind,
      href: { to: '/mn/$protx', params: { protx: MN.evo.proRegTxHash } },
      stamp: localStamp(),
      rank: 100,
    })
    for (const order of [
      [[hit('masternode')], [hit('evonode')]],
      [[hit('evonode')], [hit('masternode')]],
    ]) {
      const merged = mergeHits(order)
      expect(merged).toHaveLength(1)
      expect(merged[0]?.kind).toBe('evonode')
    }
  })

  it('has no match for text Explorer does not know, and never asks for a number or a short word @NX-05', async () => {
    expect(
      await peSearch.resolve(classify('zzzz-not-a-real-core-thing-12345', 'mainnet'), ctx()),
    ).toEqual([])
    expect(await peSearch.resolve(classify('2569992', 'mainnet'), ctx())).toEqual([])
    expect(await peSearch.resolve(classify('ab', 'mainnet'), ctx())).toEqual([])
  })

  it('is an index lookup, so Decentralized only mode never plans it @NX-05', () => {
    expect(peSearch.cost).toBe('index')
    expect(peSearch.what).toBeDefined()
  })

  it('sends nothing for a flagged input @X-01', async () => {
    const flagged = { ...classify('quantum', 'mainnet'), warning: 'possible-secret' as const }
    expect(await peSearch.resolve(flagged, ctx())).toEqual([])
  })
})
