import { sha256 } from '@noble/hashes/sha2.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hex = (b: Uint8Array) =>
  Array.from(sha256(b), (x) => x.toString(16).padStart(2, '0')).join('')
const partA = new Uint8Array([1, 2, 3, 4])
const partB = new Uint8Array([5, 6, 7])

const mocks = vi.hoisted(() => ({
  parts: [] as { url: string; sha256: string }[],
  rawInit: vi.fn(),
}))
vi.mock('virtual:radar-sdk-wasm-parts', () => ({ default: mocks.parts }))
vi.mock('@dashevo/wasm-sdk/raw', () => ({ default: mocks.rawInit }))

async function drain(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer())
}

describe('the split wasm loader', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.parts.splice(
      0,
      mocks.parts.length,
      {
        url: '/a.wasm',
        sha256: hex(partA),
      },
      { url: '/b.wasm', sha256: hex(partB) },
    )
    mocks.rawInit.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  const serve = (files: Record<string, Uint8Array>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(files[url] ? files[url].slice().buffer : null, {
            status: files[url] ? 200 : 404,
          }),
        ),
      ),
    )

  it('hands the compiler the parts in order once each matches its digest', async () => {
    serve({ '/a.wasm': partA, '/b.wasm': partB })
    mocks.rawInit.mockImplementation(async (arg: { module_or_path: Response }) => {
      expect([...(await drain(arg.module_or_path))]).toEqual([1, 2, 3, 4, 5, 6, 7])
    })
    const { default: init } = await import('@/data/sdk/worker/wasm-split')
    await init()
    expect(mocks.rawInit).toHaveBeenCalledTimes(1)
  })

  it('refuses a part whose bytes are not the ones built, and tries again on the next connect', async () => {
    serve({ '/a.wasm': partA, '/b.wasm': new Uint8Array([9, 9, 9]) })
    mocks.rawInit.mockImplementation(async (arg: { module_or_path: Response }) => {
      await drain(arg.module_or_path)
    })
    const { default: init } = await import('@/data/sdk/worker/wasm-split')
    await expect(init()).rejects.toThrow(/does not match the build/)
    serve({ '/a.wasm': partA, '/b.wasm': partB })
    await init()
    expect(mocks.rawInit).toHaveBeenCalledTimes(2)
  })

  it('fails when a part is missing', async () => {
    serve({ '/a.wasm': partA })
    mocks.rawInit.mockImplementation(async (arg: { module_or_path: Response }) => {
      await drain(arg.module_or_path)
    })
    const { default: init } = await import('@/data/sdk/worker/wasm-split')
    await expect(init()).rejects.toThrow(/HTTP 404/)
  })
})
