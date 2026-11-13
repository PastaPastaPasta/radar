import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { endpoint } from '@/data/endpoints'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
/** `wasm-split.ts` stands in for the SDK's wasm loader through a build alias, so no import names it. */
const WORKERS = [
  'data/sdk/worker/sdk.worker.ts',
  'data/sdk/worker/wasm-split.ts',
  'data/core/decode.worker.ts',
]

/** Code no worker may contain: it is, or reaches, a hosted client, the hosts they ask or the mode's gate. */
const HOSTED_MODULES =
  /^data\/(http|endpoints|hyphen\/|insight\/|pe\/|radar\/|rate\/|dapi-core\/|core\/client|query\/)|^lib\/source-mode/
/**
 * The only file of a worker's graph that starts a request itself: same-origin assets the build emitted
 * (`import.meta.ROLLUP_FILE_URL_*`), checked against their hash as they stream. The SDK's own requests come from the
 * wasm package, through the worker's `fetch`, which `sdk.worker.ts` wraps.
 */
const MAY_REQUEST = ['data/sdk/worker/wasm-split.ts']
const REQUEST_API =
  /\b(fetch\s*\(|new\s+(WebSocket|EventSource|XMLHttpRequest)\b|sendBeacon|importScripts)/

const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function resolve(from: string, spec: string): string | undefined {
  const base = spec.startsWith('@/')
    ? spec.slice(2)
    : spec.startsWith('.')
      ? path.posix.join(path.posix.dirname(from), spec)
      : undefined
  if (base === undefined) return undefined
  const clean = base.replace(/\?.*$/, '')
  for (const ext of ['', '.ts', '/index.ts']) {
    try {
      readFileSync(path.join(SRC, clean + ext))
      return path.posix.normalize(clean + ext)
    } catch {
      // try the next form
    }
  }
  return undefined
}

function graph(roots: string[]): Map<string, string> {
  const files = new Map<string, string>()
  const queue = [...roots]
  for (let file = queue.shift(); file; file = queue.shift()) {
    if (files.has(file)) continue
    const text = readFileSync(path.join(SRC, file), 'utf8')
    files.set(file, text)
    for (const m of text.matchAll(IMPORT)) {
      const next = resolve(file, (m[1] ?? m[2] ?? m[3])!)
      if (next) queue.push(next)
    }
  }
  return files
}

describe('what a worker can reach @X-05 @X-09', () => {
  const files = graph(WORKERS)

  it('finds the workers’ own code (so the checks below look at something)', () => {
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['data/sdk/worker/api.ts', 'data/sdk/worker/fetch-guard.ts']),
    )
    expect(files.size).toBeGreaterThan(8)
  })

  it('imports no hosted client, no hosted host and no mode gate, so it has none to bypass', () => {
    expect([...files.keys()].filter((f) => HOSTED_MODULES.test(f))).toEqual([])
  })

  it('starts a request itself only to fetch this build’s wasm parts', () => {
    const requesting = [...files].filter(([, text]) => REQUEST_API.test(text)).map(([f]) => f)
    expect(requesting).toEqual(MAY_REQUEST)
  })

  it('sends every request the SDK wasm makes through the pacing wrapper', () => {
    const worker = files.get('data/sdk/worker/sdk.worker.ts')!
    expect(worker).toContain('globalThis.fetch = guard.fetch')
  })

  it('names no outside host in its own code', () => {
    const named = [...files].flatMap(([file, text]) =>
      [...text.matchAll(/https?:\/\/[a-z0-9.-]+/gi)]
        .map((m) => m[0])
        .filter((u) => !/^https?:\/\/(localhost|example|quorums\.)/.test(u))
        .map((u) => `${file}: ${u}`),
    )
    expect(named).toEqual([])
  })

  it('is told of one trust host per network, a quorum host', () => {
    for (const net of ['mainnet', 'testnet', 'devnet-ruby'] as const) {
      const host = new URL(endpoint(net, 'quorums')!).hostname
      expect(host).toMatch(/^quorums\.[a-z0-9-]+\.networks\.dash\.org$/)
    }
  })
})
