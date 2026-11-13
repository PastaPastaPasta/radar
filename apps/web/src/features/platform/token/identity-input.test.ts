import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { readIdentityText, resolveIdentityText } from './identity-input'

const ID = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

const resolveName = vi.hoisted(() => vi.fn())
vi.mock('@/data/sdk/queries', () => ({
  sdkQueries: {
    'dpns.resolveName': (_net: string, args: { name: string }) => ({
      queryKey: ['resolve', args.name],
      queryFn: () => resolveName(args.name) as Promise<unknown>,
    }),
  },
}))

describe('readIdentityText', () => {
  it('tells an ID from a name, and adds .dash to a bare label', () => {
    expect(readIdentityText(` ${ID} `)).toEqual({ kind: 'id', id: ID })
    expect(readIdentityText('pshenmic')).toEqual({ kind: 'name', name: 'pshenmic.dash' })
    expect(readIdentityText('Pshenmic.DASH')).toEqual({ kind: 'name', name: 'Pshenmic.dash' })
  })

  it('rejects what is neither', () => {
    expect(readIdentityText('')).toEqual({ kind: 'invalid' })
    expect(readIdentityText('a b')).toEqual({ kind: 'invalid' })
    expect(readIdentityText('ab')).toEqual({ kind: 'invalid' })
  })
})

describe('resolveIdentityText', () => {
  const run = (raw: string) => resolveIdentityText(new QueryClient(), 'mainnet', raw)

  it('asks DPNS only for a name', async () => {
    resolveName.mockClear()
    expect(await run(ID)).toEqual({ ok: true, id: ID })
    expect(resolveName).not.toHaveBeenCalled()
    resolveName.mockResolvedValueOnce({ data: ID })
    expect(await run('alice')).toEqual({ ok: true, id: ID, name: 'alice.dash' })
  })

  it('says a name nobody holds is not found, and a failed lookup is an error', async () => {
    resolveName.mockResolvedValueOnce({ data: null })
    expect(await run('nobody')).toEqual({ ok: false, reason: 'not-found', name: 'nobody.dash' })
    resolveName.mockRejectedValueOnce(new Error('down'))
    expect(await run('broken')).toEqual({ ok: false, reason: 'error', name: 'broken.dash' })
    expect(await run('!!')).toEqual({ ok: false, reason: 'invalid' })
  })
})
