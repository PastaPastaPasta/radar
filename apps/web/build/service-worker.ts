import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build, transformWithEsbuild, type Plugin } from 'vite'

export const SERVICE_WORKER_SOURCE = resolve(__dirname, '..', 'src', 'sw', 'sw.ts')
export const SERVICE_WORKER_FILE = 'sw.js'

/** Bundles the worker on its own, so it shares no chunk with the app and its name never carries a hash. */
export async function buildServiceWorker(source = SERVICE_WORKER_SOURCE): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: { entry: source, formats: ['iife'], name: 'radarServiceWorker' },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : [],
  )
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (!chunk) throw new Error('The service worker build produced no script')
  return chunk.code
}

/** Emits `src/sw/sw.ts` as `/sw.js`, from the build and from the dev server. */
export function serviceWorker(): Plugin {
  return {
    name: 'radar:service-worker',
    configureServer(server) {
      server.middlewares.use(`/${SERVICE_WORKER_FILE}`, (_req, res, next) => {
        transformWithEsbuild(readFileSync(SERVICE_WORKER_SOURCE, 'utf8'), SERVICE_WORKER_SOURCE)
          .then(({ code }) => {
            res.setHeader('content-type', 'text/javascript; charset=utf-8')
            res.end(code)
          })
          .catch(next)
      })
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: SERVICE_WORKER_FILE,
        source: await buildServiceWorker(),
      })
    },
  }
}
