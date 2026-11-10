import { describe, expect, it } from 'vitest'
import { fixtureWorker, SERVICE_WORKER_FILE } from './fixture-worker'

describe('fixtureWorker', () => {
  it('only applies to the fixture build', () => {
    const apply = (enabled: boolean) => {
      const plugin = fixtureWorker(enabled)
      return (plugin.apply as () => boolean)()
    }
    expect(apply(true)).toBe(true)
    expect(apply(false)).toBe(false)
  })

  it('ships msw’s service worker script', () => {
    const emitted: { fileName: string; source: string }[] = []
    const plugin = fixtureWorker(true)
    const generateBundle = plugin.generateBundle as (this: unknown) => void
    generateBundle.call({ emitFile: (f: { fileName: string; source: string }) => emitted.push(f) })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.fileName).toBe(SERVICE_WORKER_FILE)
    expect(emitted[0]?.source).toContain('INTEGRITY_CHECKSUM')
  })
})
