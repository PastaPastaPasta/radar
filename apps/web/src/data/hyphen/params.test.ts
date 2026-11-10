import { describe, expect, it } from 'vitest'
import { HYPHEN_PARAMS, resolveHyphenRequest } from '../../../../../workers/edge/src/hyphen-path'
import type { HyListQuery } from './params'

describe('Hyphen query parameters', () => {
  it('forwards every name the client may send', () => {
    const all = Object.fromEntries(HYPHEN_PARAMS.map((name) => [name, '1']))
    const resolved = resolveHyphenRequest('/x/hy/mainnet/blocks', `?${new URLSearchParams(all)}`)
    expect(resolved.ok && [...resolved.url.searchParams.keys()].sort()).toEqual(
      [...HYPHEN_PARAMS].sort(),
    )
  })

  it('does not type a name the Worker would drop', () => {
    // @ts-expect-error `direction` is not on the Worker's allowlist
    const query: HyListQuery = { direction: 'in' }
    const resolved = resolveHyphenRequest('/x/hy/mainnet/blocks', '?direction=in')
    expect(query).toBeDefined()
    expect(resolved.ok && resolved.url.search).toBe('')
  })
})
