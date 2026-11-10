import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { healthRegistry } from '@/data/health'
import { renderAt } from './test-utils'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 15000 })

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function coreRow(height: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-pulse="core"]')
    expect(el).toHaveTextContent(height)
    return el!
  })
}

describe('Home page', () => {
  it('shows the Core tip with its ChainLock and a source line @IN-01', async () => {
    renderAt('/')
    const row = await coreRow('2,570,085')
    await waitFor(() => expect(row).toHaveTextContent('ChainLocked'))
    expect(row.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('lists the latest Core blocks and Platform transitions @IN-01', async () => {
    renderAt('/')
    const blocks = await screen.findByRole('table', { name: 'Latest Core blocks' })
    await waitFor(() => expect(within(blocks).getAllByRole('row').length).toBeGreaterThan(5))
    expect(within(blocks).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    const transitions = await screen.findByRole('table', { name: /Latest Platform transitions/ })
    await waitFor(() => expect(within(transitions).getAllByRole('row').length).toBeGreaterThan(1))
  })

  it('shows the Platform height and epoch from Platform Explorer @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="platform"]')
      expect(el).toHaveTextContent(/Epoch \d+/)
      return el!
    })
    expect(row.querySelector('[data-source="pe"]')).not.toBeNull()
  })

  it('shows the census headline from Radar @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="census"]')
      expect(el).toHaveTextContent(/\d[\d,]* of \d[\d,]*/)
      return el!
    })
    expect(row.querySelector('[data-source="radar"]')).not.toBeNull()
  })

  it('says the node map is not loaded yet instead of drawing an empty one @IN-01', async () => {
    renderAt('/')
    expect(await screen.findByLabelText('The node map is not loaded yet')).toBeInTheDocument()
  })

  it('says live updates stopped when the Core connection is down, and offers a retry @IN-15', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await coreRow('2,570,085')
    expect(document.querySelector('[data-live-notice]')).toBeNull()
    act(() => {
      for (let i = 0; i < 3; i++) {
        healthRegistry.report('mainnet', 'dapi', { ok: false, kind: 'network', message: 'down' })
      }
    })
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Live updates have stopped.')
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeEnabled()
    await user.click(within(notice).getByRole('button', { name: 'Try again' }))
  })

  it('works on testnet and names the network @IN-16 @HY-19', async () => {
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    expect(document.querySelector('[data-net]')).toHaveTextContent(/testnet/i)
  })
})
