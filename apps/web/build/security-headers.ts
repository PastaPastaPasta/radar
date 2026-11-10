import type { Plugin } from 'vite'
import { SECURITY_HEADERS } from '../../../workers/edge/src/headers'

export const STATIC_ASSET_PATTERN = '/assets/*'

const title = (name: string) =>
  name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')

/** Cloudflare static-assets `_headers`: the Worker never sees the paths it names. */
export function renderHeadersFile(
  headers: Record<string, string> = SECURITY_HEADERS,
  pattern = STATIC_ASSET_PATTERN,
): string {
  const lines = Object.entries(headers).map(([k, v]) => `  ${title(k)}: ${v}`)
  return `${pattern}\n${lines.join('\n')}\n`
}

export function securityHeaders(): Plugin {
  return {
    name: 'radar:security-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: renderHeadersFile() })
    },
  }
}
