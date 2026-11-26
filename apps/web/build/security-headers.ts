import type { Plugin } from 'vite'
import { SECURITY_HEADERS } from '../../../workers/edge/src/headers'

/** The paths served straight from the asset store, without the Worker: `!` entries of `run_worker_first`. */
export const STATIC_ASSET_PATTERNS = [
  '/assets/*',
  '/dashhq/*',
  '/favicon.ico',
  '/robots.txt',
] as const

const title = (name: string) =>
  name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')

/** Cloudflare static-assets `_headers`: the Worker never sees the paths it names. */
export function renderHeadersFile(
  headers: Record<string, string> = SECURITY_HEADERS,
  patterns: readonly string[] = STATIC_ASSET_PATTERNS,
): string {
  const lines = Object.entries(headers).map(([k, v]) => `  ${title(k)}: ${v}`)
  return patterns.map((pattern) => `${pattern}\n${lines.join('\n')}\n`).join('')
}

export function securityHeaders(): Plugin {
  return {
    name: 'radar:security-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: renderHeadersFile() })
    },
  }
}
