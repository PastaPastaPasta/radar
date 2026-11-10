import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

async function start(container: HTMLElement) {
  if (import.meta.env.VITE_DATA_MODE === 'fixtures') {
    const { startFixtureWorker } = await import('./test/msw/browser')
    await startFixtureWorker()
  }
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start(root)
