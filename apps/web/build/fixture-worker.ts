import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

export const SERVICE_WORKER_FILE = 'mockServiceWorker.js'

/** Ships MSW's service worker script, for the fixture build only. */
export function fixtureWorker(enabled: boolean): Plugin {
  const source = () =>
    readFileSync(createRequire(import.meta.url).resolve('msw/mockServiceWorker.js'), 'utf8')
  return {
    name: 'radar:fixture-worker',
    apply: () => enabled,
    configureServer(server) {
      server.middlewares.use(`/${SERVICE_WORKER_FILE}`, (_req, res) => {
        res.setHeader('content-type', 'text/javascript')
        res.end(source())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SERVICE_WORKER_FILE, source: source() })
    },
  }
}
