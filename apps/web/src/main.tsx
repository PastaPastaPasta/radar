// Configures zod before any route module builds a schema.
import './data/zod'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, createAppRouter, createQueryClient } from './app'
import { loadDevnets } from './app/devnets'
import { enableLiveTip } from './app/live-tip'
import { preconnectHostedSources } from './app/preconnect'
import { registerServiceWorker } from './app/sw-register'
import { enableEarlyAnswers } from './data/early'
import { setSdkDevnets } from './data/sdk/devnets'
import { i18nReady } from './i18n'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

async function start(container: HTMLElement) {
  setSdkDevnets(loadDevnets)
  if (import.meta.env.VITE_DATA_MODE === 'fixtures') {
    const { startFixtureWorker } = await import('./test/msw/browser')
    await startFixtureWorker()
  } else {
    const { installProductionDapiTransport } = await import('./data/dapi-core/production')
    installProductionDapiTransport({ devnets: loadDevnets })
    enableEarlyAnswers()
  }
  enableLiveTip()
  preconnectHostedSources()
  // The first route starts now; its loaders wait in the root route for the locale's catalog.
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient)
  void router.load().catch(() => undefined)
  await i18nReady
  createRoot(container).render(
    <StrictMode>
      <App started={{ queryClient, router }} />
    </StrictMode>,
  )
  requestAnimationFrame(() => {
    window.setTimeout(registerServiceWorker, 0)
  })
}

void start(root)
