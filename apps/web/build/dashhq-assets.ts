import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

export const DASHHQ_DIR = resolve(__dirname, '..', 'vendor', 'dashhq')
export const DASHHQ_BASE = '/dashhq/'

const RUNTIME_EXTENSIONS = new Set(['.js', '.css', '.woff2'])

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
}

export function runtimeFiles(dir = DASHHQ_DIR, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name
    if (entry.isDirectory()) return runtimeFiles(join(dir, entry.name), `${rel}/`)
    return RUNTIME_EXTENSIONS.has(extname(entry.name)) ? [rel] : []
  })
}

/** Serves the vendored shell untouched at /dashhq/*, from the dev server, preview and the build output. */
export function dashhqAssets(dir = DASHHQ_DIR): Plugin {
  const root = resolve(dir)
  return {
    name: 'radar:dashhq-assets',
    configureServer(server) {
      server.middlewares.use(DASHHQ_BASE, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '')
        const file = resolve(root, rel)
        if (!file.startsWith(root + sep) || !RUNTIME_EXTENSIONS.has(extname(file))) return next()
        try {
          const body = readFileSync(file)
          res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
          res.end(body)
        } catch {
          next()
        }
      })
    },
    generateBundle() {
      for (const rel of runtimeFiles(root)) {
        this.emitFile({
          type: 'asset',
          fileName: `dashhq/${rel}`,
          source: readFileSync(join(root, rel)),
        })
      }
    },
  }
}
