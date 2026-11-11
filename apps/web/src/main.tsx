// Configures zod before any route module builds a schema.
import './data/zod'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { loadDevnets } from './app/devnets'
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
  }
  await i18nReady
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start(root)
