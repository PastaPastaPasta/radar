import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { recordViewedIdentity, setViewedEnabled } from '@/features/entity'
import { forgetSdkSettings, SDK_SETTINGS_KEY } from '@/data/sdk/settings'
import { wellKnownLabel } from '@/lib/well-known'
import { forgetDevFlags } from '../dev-flags'
import { forgetLabels, installLabelOverlay, LABELS_KEY } from '../labels'
import { panelsState, resetPanels } from '../panels'

const VIEWED_KEY = 'radar.viewed'
const ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

let removeOverlay: (() => void) | undefined
beforeEach(() => {
  setViewedEnabled(false)
  localStorage.clear()
  forgetSdkSettings()
  forgetLabels()
  forgetDevFlags()
  resetPanels()
})
afterEach(() => {
  removeOverlay?.()
  removeOverlay = undefined
  setViewedEnabled(false)
  localStorage.clear()
  forgetSdkSettings()
  forgetLabels()
  forgetDevFlags()
  resetPanels()
})

describe('Viewed identities @NX-18', () => {
  it('is off by default, remembers when switched on, and erases when cleared or switched off', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const box = await screen.findByRole('checkbox', { name: 'Remember the identities I view' })
    expect(box).not.toBeChecked()
    recordViewedIdentity('mainnet', ID)
    expect(localStorage.getItem(VIEWED_KEY)).toBeNull()

    await user.click(box)
    expect(box).toBeChecked()
    recordViewedIdentity('mainnet', ID)
    expect(await screen.findByText('1 identity remembered on this network')).toBeInTheDocument()
    expect(screen.getByText(/seed list for token holders/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear viewed identities' }))
    expect(await screen.findByText('0 identities remembered on this network')).toBeInTheDocument()
    expect(box).toBeChecked()

    recordViewedIdentity('mainnet', ID)
    await user.click(box)
    expect(await screen.findByText('0 identities remembered on this network')).toBeInTheDocument()
  })
})

describe('Connection settings @NX-74', () => {
  it('saves a valid change under radar.sdk, and refuses an invalid one', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const timeout = await screen.findByLabelText('Request timeout (ms)')
    await user.type(timeout, '12000')
    await user.type(screen.getByLabelText('Retries'), '3')
    await user.selectOptions(screen.getByLabelText('Ban nodes that fail'), 'on')
    await user.selectOptions(screen.getByLabelText('SDK log level'), 'debug')
    await user.click(screen.getByRole('button', { name: 'Apply and restart the SDK' }))

    expect(JSON.parse(localStorage.getItem(SDK_SETTINGS_KEY)!)).toEqual({
      quorumUrls: {},
      requestTimeoutMs: 12000,
      retries: 3,
      banFailedAddress: true,
      logLevel: 'debug',
    })
    expect(await screen.findByText('Applied. The Platform SDK restarted.')).toBeInTheDocument()

    await user.clear(timeout)
    await user.type(timeout, '5')
    await user.click(screen.getByRole('button', { name: 'Apply and restart the SDK' }))
    expect(await screen.findByText('Whole number from 100 to 300000.')).toBeInTheDocument()
    expect(
      (JSON.parse(localStorage.getItem(SDK_SETTINGS_KEY)!) as { requestTimeoutMs: number })
        .requestTimeoutMs,
    ).toBe(12000)
  })

  it('refuses a quorum address that is not https, and keeps a good one', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const field = await screen.findByLabelText(/Quorum list URL, Mainnet/)
    await user.type(field, 'http://q.example')
    await user.click(screen.getByRole('button', { name: 'Apply and restart the SDK' }))
    expect(await screen.findByText(/must start with https/)).toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'https://q.example/')
    await user.click(screen.getByRole('button', { name: 'Apply and restart the SDK' }))
    expect(
      (JSON.parse(localStorage.getItem(SDK_SETTINGS_KEY)!) as { quorumUrls: object }).quorumUrls,
    ).toEqual({ mainnet: 'https://q.example' })
  })

  it('resets each setting to its default', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      SDK_SETTINGS_KEY,
      JSON.stringify({ quorumUrls: {}, requestTimeoutMs: 9000, retries: 4, logLevel: 'trace' }),
    )
    renderAt('/settings')
    const timeout = await screen.findByLabelText('Request timeout (ms)')
    expect(timeout).toHaveValue('9000')
    const resets = screen
      .getAllByRole('button', { name: 'Reset' })
      .filter((b) => !(b as HTMLButtonElement).disabled)
    expect(resets).toHaveLength(3)

    await user.click(resets[0]!)
    await waitFor(() => expect(timeout).toHaveValue(''))
    expect(JSON.parse(localStorage.getItem(SDK_SETTINGS_KEY)!)).toEqual({
      quorumUrls: {},
      retries: 4,
      logLevel: 'trace',
    })
  })
})

describe('Developer settings @NX-74', () => {
  it('shows the shortcuts, switches each off, and shows the build', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const dev = (await screen.findByRole('heading', { name: 'Developer' })).closest('section')!
    expect(within(dev).getAllByText('Alt')).toHaveLength(2)
    const proof = within(dev).getByRole('checkbox', {
      name: /Open the proof inspector with the keyboard/,
      checked: true,
    })
    expect(proof).toBeInTheDocument()
    await user.click(proof)
    expect(JSON.parse(localStorage.getItem('radar.dev')!)).toEqual({
      proofShortcut: false,
      diagnosticsShortcut: true,
    })
    expect(within(dev).getByText('Radar')).toBeInTheDocument()
    expect(within(dev).getByText('Platform SDK in the worker')).toBeInTheDocument()
  })

  it('opens the proof inspector and diagnostics from the page', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await user.click(await screen.findByRole('button', { name: 'Open diagnostics' }))
    expect(panelsState().diagnostics.open).toBe(true)
    expect(await screen.findByRole('dialog', { name: 'Diagnostics' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(panelsState().diagnostics.open).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Open the proof inspector' }))
    expect(panelsState().proof.open).toBe(true)
    expect(await screen.findByRole('dialog', { name: 'Proof inspector' })).toBeInTheDocument()
  })

  it('names an ID of its own, and the name wins over the shared table', async () => {
    const user = userEvent.setup()
    removeOverlay = installLabelOverlay()
    renderAt('/settings')
    await user.type(await screen.findByLabelText(/ID on Mainnet/), ID)
    await user.type(screen.getByLabelText('Name'), 'My wallet')
    await user.click(screen.getByRole('button', { name: 'Add name' }))

    const list = await screen.findByRole('list', { name: 'Your names' })
    expect(within(list).getByText('My wallet')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(LABELS_KEY)!)).toEqual([
      { net: 'mainnet', kind: 'identity', id: ID, label: 'My wallet' },
    ])
    expect(wellKnownLabel('mainnet', 'identity', ID)).toBe('My wallet')

    await user.click(within(list).getByRole('button', { name: 'Remove the label My wallet' }))
    expect(wellKnownLabel('mainnet', 'identity', ID)).toBeUndefined()
  })

  it('refuses an ID that is not Base58 text', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await user.type(await screen.findByLabelText(/ID on Mainnet/), 'not an id')
    await user.type(screen.getByLabelText('Name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Add name' }))
    expect(await screen.findByText(/Base58 text/)).toBeInTheDocument()
    expect(localStorage.getItem(LABELS_KEY)).toBeNull()
  })
})

describe('Devnets @NX-75', () => {
  const addDevnet = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.type(await screen.findByLabelText('Devnet name'), name)
    await user.type(screen.getByLabelText('DAPI addresses'), '192.0.2.10:1443')
    await user.type(
      screen.getByLabelText(/^Quorum list URL\s+optional$/),
      'https://quorums.example.org',
    )
    await user.click(screen.getByRole('button', { name: 'Add devnet' }))
  }

  it('shows each saved devnet’s addresses and quorum list, and refuses a name already saved', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await addDevnet(user, 'ruby')
    const list = await screen.findByRole('list', { name: 'Saved devnets' })
    expect(within(list).getByText('192.0.2.10:1443')).toBeInTheDocument()
    expect(within(list).getByText('https://quorums.example.org')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Devnet name'), 'ruby')
    await user.type(screen.getByLabelText('DAPI addresses'), '192.0.2.99:1443')
    await user.click(screen.getByRole('button', { name: 'Add devnet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already saved')
    expect(
      (JSON.parse(localStorage.getItem('radar.devnets')!) as { dapiAddresses: string[] }[])[0]
        ?.dapiAddresses,
    ).toEqual(['192.0.2.10:1443'])
  })

  it('copies a link that carries the devnet’s name', async () => {
    const user = userEvent.setup()
    let copied = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => ((copied = t), Promise.resolve()) },
    })
    renderAt('/settings')
    await addDevnet(user, 'ruby')
    await user.click(await screen.findByRole('button', { name: 'Copy a link to ruby' }))
    await waitFor(() => expect(new URL(copied).searchParams.get('network')).toBe('devnet-ruby'))
  })
})
