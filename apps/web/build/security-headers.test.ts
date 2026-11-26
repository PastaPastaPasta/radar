import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS, withSecurityHeaders } from '../../../workers/edge/src/headers'
import { renderHeadersFile, securityHeaders, STATIC_ASSET_PATTERNS } from './security-headers'

function parse(file: string): { pattern: string; headers: Record<string, string> }[] {
  return file
    .trimEnd()
    .split(/\n(?=\S)/)
    .map(parseBlock)
}

function parseBlock(block: string): { pattern: string; headers: Record<string, string> } {
  const [pattern = '', ...rest] = block.split('\n')
  const headers = Object.fromEntries(
    rest.map((line) => {
      const i = line.indexOf(':')
      return [line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]
    }),
  )
  return { pattern, headers }
}

describe('static asset security headers', () => {
  it('carries exactly the headers the Worker sets on every other response, for each bypassed path', () => {
    const blocks = parse(renderHeadersFile())
    expect(blocks.map((b) => b.pattern)).toEqual([...STATIC_ASSET_PATTERNS])
    const sent = withSecurityHeaders(new Response('x'))
    for (const { headers } of blocks) {
      expect(Object.keys(headers).sort()).toEqual(Object.keys(SECURITY_HEADERS).sort())
      for (const [name, value] of Object.entries(headers))
        expect(sent.headers.get(name)).toBe(value)
    }
  })

  it('covers the paths the Worker is configured not to run for', () => {
    const wrangler = readFileSync(
      join(__dirname, '..', '..', '..', 'workers', 'edge', 'wrangler.jsonc'),
      'utf8',
    ).replace(/,(\s*[}\]])/g, '$1')
    const first = (JSON.parse(wrangler) as { assets: { run_worker_first: string[] } }).assets
      .run_worker_first
    const bypassed = first.filter((p) => p.startsWith('!')).map((p) => p.slice(1))
    expect(bypassed).toEqual([...STATIC_ASSET_PATTERNS])
  })

  it('emits _headers into the build output', () => {
    const emitted: { fileName: string; source: string }[] = []
    const plugin = securityHeaders()
    const hook = plugin.generateBundle as (this: unknown) => void
    hook.call({ emitFile: (f: { fileName: string; source: string }) => emitted.push(f) })
    expect(emitted).toEqual([{ type: 'asset', fileName: '_headers', source: renderHeadersFile() }])
  })
})
