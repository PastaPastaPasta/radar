import { beforeEach, describe, expect, it, vi } from 'vitest'

const vite = vi.hoisted(() => ({
  build: vi.fn(),
  transformWithEsbuild: vi.fn(),
}))
vi.mock('vite', () => vite)

import {
  buildServiceWorker,
  SERVICE_WORKER_FILE,
  SERVICE_WORKER_SOURCE,
  serviceWorker,
} from './service-worker'

beforeEach(() => {
  vite.build.mockReset()
})

describe('serviceWorker', () => {
  it('bundles the worker alone, in memory, as one script', async () => {
    vite.build.mockResolvedValue({ output: [{ type: 'chunk', code: 'self.skipWaiting()' }] })
    expect(await buildServiceWorker()).toBe('self.skipWaiting()')
    const config = vite.build.mock.calls[0]?.[0] as {
      configFile: boolean
      build: { write: boolean; lib: { entry: string; formats: string[] } }
    }
    expect(config.configFile).toBe(false)
    expect(config.build.write).toBe(false)
    expect(config.build.lib).toMatchObject({ entry: SERVICE_WORKER_SOURCE, formats: ['iife'] })
  })

  it('fails the build when the worker produces no script', async () => {
    vite.build.mockResolvedValue({ output: [{ type: 'asset' }] })
    await expect(buildServiceWorker()).rejects.toThrow('no script')
  })

  it('emits it as an unhashed asset at the site root', async () => {
    vite.build.mockResolvedValue({ output: [{ type: 'chunk', code: 'self.skipWaiting()' }] })
    const emitted: unknown[] = []
    const generateBundle = serviceWorker().generateBundle as (this: unknown) => Promise<void>
    await generateBundle.call({ emitFile: (f: unknown) => emitted.push(f) })
    expect(SERVICE_WORKER_FILE).toBe('sw.js')
    expect(emitted).toEqual([{ type: 'asset', fileName: 'sw.js', source: 'self.skipWaiting()' }])
  })
})
