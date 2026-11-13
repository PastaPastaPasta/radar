import { describe, expect, it } from 'vitest'
import { base58Encode } from '@/lib/base58'
import { decodePlatformAddress } from '@/lib/bech32'
import { bytesToHex } from '@/lib/hex'
import {
  bigintOf,
  fundingOf,
  platformAddressOf,
  proTxHashHex,
  scriptAddressOf,
} from './decoded'

const ADDRESS = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs'
const TESTNET_ADDRESS = 'tdash1krma5z3ttj75la4m93xcndna9ullamq9y5fzq2j7'

describe('platformAddressOf', () => {
  it('writes the SDK’s hex address (a type byte, then the hash) as bech32m on each network', () => {
    const parts = decodePlatformAddress(ADDRESS)!
    const hex = `00${bytesToHex(parts.hash)}`
    expect(platformAddressOf(hex, 'mainnet')).toBe(ADDRESS)
    expect(platformAddressOf(hex, 'testnet')).toBe(TESTNET_ADDRESS)
  })

  it('reads type byte 1 as a script hash, and refuses anything else', () => {
    const parts = decodePlatformAddress(ADDRESS)!
    const p2sh = platformAddressOf(`01${bytesToHex(parts.hash)}`, 'mainnet')!
    expect(decodePlatformAddress(p2sh)?.type).toBe('p2sh')
    expect(platformAddressOf(`02${bytesToHex(parts.hash)}`, 'mainnet')).toBeUndefined()
    expect(platformAddressOf('abcd', 'mainnet')).toBeUndefined()
  })
})

describe('scriptAddressOf', () => {
  it('names the Core address a pay-to-key-hash or pay-to-script-hash output pays', () => {
    expect(scriptAddressOf('dqkUU1jxIsENcm3DII2gE0hvq3HWfaCIrA==', 'mainnet')).toBe(
      'XiHYTyBaEUUsgK6w6VYyUmrVc8k67qwGbQ',
    )
    expect(scriptAddressOf('dqkUU1jxIsENcm3DII2gE0hvq3HWfaCIrA==', 'testnet')).toBe(
      'yTv9UvG1g28x242UfLsNWoGqtRETdbtPiW',
    )
    expect(scriptAddressOf('qRRTWPEiwQ1ybcMgjaATSG+rcdZ9oIc=', 'mainnet')).toBe(
      '7a1MPTJHdegJcJjjdKZrPFXHqsHVTBviEp',
    )
  })

  it('returns nothing for any other script, or for text that is not base64', () => {
    expect(scriptAddressOf('agA=', 'mainnet')).toBeUndefined()
    expect(scriptAddressOf('***', 'mainnet')).toBeUndefined()
  })
})

describe('proTxHashHex', () => {
  it('turns the identifier form of a ProTxHash back into hex', () => {
    const hex = '001cb9381b08d784f4c1e1e220906874ea9e88f7124ebdf8baf0782007afad4f'
    const bytes = Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)))
    expect(proTxHashHex(base58Encode(bytes))).toBe(hex)
    expect(proTxHashHex('short')).toBeUndefined()
  })
})

describe('fundingOf', () => {
  const instant = {
    $type: 'instant',
    transaction:
      'AwAIAAHljXCFfP9ADOAVgHMoFxXcIJFnHXGV23o/z8IRu+W6rwAAAABrSDBFAiEAvLwS3OUfEohfEqCLy0OrWYG6dLYV5vL0q+iMWawBgasCIGPgVee/PlJ9TRCNK9HMH0vlxmUL+bA+KHXFMh6e5xZnASEDxYPliJzWbgTkAJJ0oHUDIYTtxE0NV9LGAJMNqd3uL1L/////AY3CSAAAAAAAAmoAAAAAACQBAY3CSAAAAAAAGXapFFNY8SLBDXJtwyCNoBNIb6tx1n2giKw=',
    outputIndex: 0,
  }

  it('reads the Core transaction id off an instant proof: the double SHA-256 of the transaction, reversed', () => {
    expect(fundingOf(instant)).toEqual({
      kind: 'instant',
      txid: '1b4d50758f375f468ba60e9c5709e4cba7e1ae3cd320686a26181b581a70d420',
      vout: 0,
    })
  })

  it('reads the outpoint of a chain proof', () => {
    const txid = 'ab'.repeat(32)
    expect(
      fundingOf({ $type: 'chain', outPoint: `${txid}:2`, coreChainLockedHeight: 2570000 }),
    ).toEqual({ kind: 'chain', txid, vout: 2, coreHeight: 2570000 })
  })

  it('keeps what it can when the proof is damaged, and knows nothing of other shapes', () => {
    expect(fundingOf({ $type: 'instant', transaction: '***' })).toEqual({ kind: 'instant' })
    expect(fundingOf({ $type: 'chain', outPoint: 'nonsense' })).toEqual({ kind: 'chain' })
    expect(fundingOf({ $type: 'other' })).toBeUndefined()
    expect(fundingOf(null)).toBeUndefined()
  })
})

describe('bigintOf', () => {
  it('reads a credit amount from a number or a numeric string, and nothing else', () => {
    expect(bigintOf(5)).toBe(5n)
    expect(bigintOf('12345678901234567890')).toBe(12345678901234567890n)
    expect(bigintOf(7n)).toBe(7n)
    expect(bigintOf('1.5')).toBeUndefined()
    expect(bigintOf(null)).toBeUndefined()
  })
})
