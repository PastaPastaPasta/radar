import { describe, expect, it } from 'vitest'
import { classify } from './classify'
import { describeInput } from './describe'

const read = (input: string) => describeInput(classify(input, 'mainnet')).join(' · ')

describe('describeInput', () => {
  it('says what each kind of input could be @X-01 @NX-05', () => {
    expect(read('86')).toBe('a number: could be a Core height, a Platform height or an epoch')
    expect(read('ab'.repeat(32))).toBe(
      'a 64-character hash: could be a Core block, a transaction, a Platform block, a state transition or an identity',
    )
    expect(read('62e907b15cbf27d5425399ebf6f0fb50ebb88f18')).toBe(
      'a 40-character hash: a public-key hash',
    )
    expect(read('BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp')).toBe(
      'an ID: could be an identity, a contract or a token',
    )
    expect(read('dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs')).toBe('a Platform address')
    expect(read('XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc')).toBe('a Core address')
    expect(read('85.209.241.228:9999')).toBe('an IP address: a masternode’s service address')
    expect(read('2026-10-01')).toContain('a date: the Core blocks of that UTC day')
    expect(read('pshenmic.dash')).toContain('a name')
    expect(read('real estate token')).toBe('text: could be a name, a contract or a token')
    expect(
      read(
        'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec/domain/FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS',
      ),
    ).toBe('a document path: a contract, a document type and a document ID')
  })
})
