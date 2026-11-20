import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { enableEarlyAnswers } from '@/data/early'
import { App } from '@/app'

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

function saveDevnet(name = 'ruby'): void {
  localStorage.setItem(
    'radar.devnets',
    JSON.stringify([{ name, dapiAddresses: ['192.0.2.1:1443'] }]),
  )
}

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function deferred() {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  return { gate, release }
}

/** DAPI's masternode list waits on the returned gate. */
function slowDapiList() {
  const dapi = deferred()
  const list = core.masternodeList.bind(core)
  const spy = vi.spyOn(core, 'masternodeList').mockImplementation(async (...args) => {
    await dapi.gate
    return list(...args)
  })
  return { ...dapi, spy }
}

const claim = () => document.querySelector('[data-mn-claim]')

describe('Masternodes, crawl first', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    enableEarlyAnswers(false)
    localStorage.clear()
  })

  it("lists the crawl's masternodes while DAPI's list is on its way, and keeps them listed once that read settles", async () => {
    enableEarlyAnswers()
    const dapi = slowDapiList()
    renderAt('/masternodes')
    await waitFor(() => expect(claim()).not.toBeNull())
    expect(dapi.spy).toHaveBeenCalled()
    dapi.release()
    await waitFor(() => expect(dapi.spy.mock.settledResults.length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    expect(claim()).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows nothing early on a devnet, which Radar does not crawl', async () => {
    enableEarlyAnswers()
    saveDevnet()
    slowDapiList()
    renderAt('/masternodes?network=devnet-ruby')
    await new Promise((r) => setTimeout(r, 300))
    expect(claim()).toBeNull()
  })

  it('waits for the joined list when early answers are off', async () => {
    const dapi = slowDapiList()
    renderAt('/masternodes')
    await new Promise((r) => setTimeout(r, 300))
    expect(claim()).toBeNull()
    dapi.release()
    await waitFor(() => expect(claim()).not.toBeNull())
  })
})
