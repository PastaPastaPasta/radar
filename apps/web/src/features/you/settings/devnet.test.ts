import { describe, expect, it } from 'vitest'
import { parseDevnetForm, splitAddresses } from './devnet'

const ok = { name: 'Ruby', addresses: '192.0.2.10:1443, node.example:443', quorumUrl: '' }

describe('parseDevnetForm', () => {
  it('lowercases the name, drops a devnet- prefix and splits addresses', () => {
    expect(parseDevnetForm({ ...ok, name: 'devnet-Ruby' }, { checkName: true })).toEqual({
      config: { name: 'ruby', dapiAddresses: ['192.0.2.10:1443', 'node.example:443'] },
    })
  })

  it('keeps an https quorum list URL', () => {
    const quorumUrl = 'https://quorums.ruby.networks.dash.org'
    expect(parseDevnetForm({ ...ok, quorumUrl }, { checkName: true })).toMatchObject({
      config: { quorumUrl },
    })
  })

  it.each([
    [{ name: '-bad' }, 'name'],
    [{ name: 'has space' }, 'name'],
    [{ name: '' }, 'name'],
    [{ addresses: '' }, 'addresses'],
    [{ addresses: 'no-port' }, 'addresses'],
    [{ addresses: '192.0.2.10:1443 nope' }, 'addresses'],
    [{ quorumUrl: 'http://insecure.example' }, 'quorum'],
  ])('rejects %j', (patch, error) => {
    expect(parseDevnetForm({ ...ok, ...patch }, { checkName: true })).toEqual({ error })
  })

  it('refuses a name that is already saved, however it is written @NX-75', () => {
    expect(
      parseDevnetForm({ ...ok, name: 'Devnet-Ruby' }, { checkName: true, existing: ['ruby'] }),
    ).toEqual({ error: 'exists' })
    expect(
      parseDevnetForm({ ...ok, name: 'jade' }, { checkName: true, existing: ['ruby'] }),
    ).toHaveProperty('config')
  })

  it('skips the name check when editing an existing devnet', () => {
    expect(parseDevnetForm({ ...ok, name: '' }, { checkName: false })).toHaveProperty('config')
  })
})

describe('splitAddresses', () => {
  it('accepts commas, spaces and lines', () => {
    expect(splitAddresses('a:1\nb:2, c:3  d:4')).toEqual(['a:1', 'b:2', 'c:3', 'd:4'])
  })
})
