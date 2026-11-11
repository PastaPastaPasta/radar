import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('./bip39-words')
  vi.resetModules()
})

describe('classifying before the wordlist has loaded', () => {
  async function classifierWithoutWordlist() {
    vi.resetModules()
    vi.doMock('./bip39-words', () => new Promise(() => undefined))
    return (await import('./classify')).classify
  }

  it('withholds anything long enough to be a recovery phrase', async () => {
    const classify = await classifierWithoutWordlist()

    expect(classify('how to buy dash with a card', 'mainnet').warning).toBe('possible-secret')
    expect(classify('a b c d e f g h i j k l', 'mainnet').warning).toBe('secret')
  })

  it('leaves short input and names alone', async () => {
    const classify = await classifierWithoutWordlist()

    expect(classify('real estate token', 'mainnet').warning).toBeUndefined()
    expect(classify('alice-bob.dash', 'mainnet').warning).toBeUndefined()
    expect(classify('2569992', 'mainnet').warning).toBeUndefined()
  })

  it('classifies normally once the list is there', async () => {
    vi.resetModules()
    const { classify } = await import('./classify')
    const { ensureWordlist } = await import('./wordlist')
    await ensureWordlist()

    expect(classify('how to buy dash with a card', 'mainnet').warning).toBeUndefined()
  })
})
