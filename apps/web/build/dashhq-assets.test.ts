import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DASHHQ_DIR, dashhqAssets, runtimeFiles } from './dashhq-assets'

interface Emitted {
  fileName: string
  source: Uint8Array
}

describe('dashhq shell assets', () => {
  it('emits the script, stylesheets and fonts byte for byte under dashhq/', () => {
    const emitted: Emitted[] = []
    const hook = dashhqAssets().generateBundle as (this: unknown) => void
    hook.call({ emitFile: (f: Emitted) => emitted.push(f) })
    const names = emitted.map((f) => f.fileName).sort()
    expect(names).toEqual(
      runtimeFiles()
        .map((f) => `dashhq/${f}`)
        .sort(),
    )
    expect(names).toContain('dashhq/dashhq-shell.js')
    expect(names).toContain('dashhq/fonts/archivo-latin-var.woff2')
    for (const f of emitted) {
      const original = readFileSync(join(DASHHQ_DIR, f.fileName.replace(/^dashhq\//, '')))
      expect(createHash('sha256').update(f.source).digest('hex')).toBe(
        createHash('sha256').update(original).digest('hex'),
      )
    }
  })

  it('loads the shell as a blocking classic script ahead of the app module', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    const shell = html.indexOf('<script src="/dashhq/dashhq-shell.js"></script>')
    const app = html.indexOf('<script type="module"')
    expect(shell).toBeGreaterThan(-1)
    expect(shell).toBeLessThan(app)
  })
})
