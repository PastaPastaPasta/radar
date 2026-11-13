import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryLog } from '@/data/query-log'
import { proofStore, type ProofRecord } from '@/data/sdk/proof-store'
import { openProofInspector, registerProofInspector } from '@/ui/proof'
import { openProofList, panelsState, resetPanels } from '../panels'
import { renderInApp } from '../test-utils'
import { ProofInspector } from './ProofInspector'

const record = (method: string, height: number): Omit<ProofRecord, 'id'> => ({
  net: 'testnet',
  method,
  args: { id: 'abc' },
  recordedAt: Date.now(),
  node: '192.0.2.1:1443',
  meta: {
    height,
    coreChainLockedHeight: 99,
    epoch: 3,
    timeMs: Date.now(),
    protocolVersion: 14,
    chainId: 'dash-testnet-51',
  },
  proof: {
    grovedbProof: new Uint8Array(64).fill(7),
    quorumHash: new Uint8Array(32).fill(1),
    signature: new Uint8Array(96).fill(2),
    round: 1,
    blockIdHash: new Uint8Array(32).fill(3),
    quorumType: 6,
  },
})

beforeEach(() => {
  proofStore.clear()
  queryLog.clear()
  resetPanels()
})
afterEach(() => {
  registerProofInspector(undefined)
  proofStore.clear()
  queryLog.clear()
  resetPanels()
  vi.restoreAllMocks()
})

describe('Proof inspector @NX-61', () => {
  it('opens on the proof of the mark that was clicked, with the call, node, height and quorum', async () => {
    const held = proofStore.put(record('identities.fetch', 4321))
    await renderInApp(<ProofInspector />)
    act(() => {
      openProofInspector({ id: held.id } as never)
    })
    const dialog = await screen.findByRole('dialog', { name: 'Proof inspector' })
    expect(within(dialog).getByText('Verified')).toBeInTheDocument()
    expect(within(dialog).getByText('identities.fetch')).toBeInTheDocument()
    expect(within(dialog).getByText('192.0.2.1:1443')).toBeInTheDocument()
    expect(within(dialog).getByText('4,321')).toBeInTheDocument()
    expect(within(dialog).getByText('dash-testnet-51')).toBeInTheDocument()
    expect(within(dialog).getByText('64 bytes of GroveDB proof')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Export evidence' })).toBeInTheDocument()
  })

  it('lists every proof held when opened without a mark, newest first, and opens one from the list', async () => {
    const user = userEvent.setup()
    proofStore.put(record('epoch.current', 10))
    proofStore.put(record('system.totalCredits', 11))
    await renderInApp(<ProofInspector />)
    act(() => {
      openProofList()
    })
    const list = await screen.findByRole('list', { name: 'Proofs held' })
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('system.totalCredits'),
      expect.stringContaining('epoch.current'),
    ])
    expect(screen.getByRole('button', { name: 'Export all (2)' })).toBeInTheDocument()

    await user.click(within(list).getAllByRole('button')[1]!)
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export evidence' })).toBeInTheDocument()
  })

  it('exports one figure, or every proof, as JSON', async () => {
    const user = userEvent.setup()
    const urls: Blob[] = []
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (b: Blob) => (urls.push(b), 'blob:x'),
        revokeObjectURL: () => undefined,
      }),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const first = proofStore.put(record('epoch.current', 10))
    proofStore.put(record('system.totalCredits', 11))
    await renderInApp(<ProofInspector />)

    act(() => {
      openProofList(first.id)
    })
    await user.click(await screen.findByRole('button', { name: 'Export evidence' }))
    const one = JSON.parse(await urls[0]!.text()) as { proofs: { method: string }[] }
    expect(one.proofs.map((p) => p.method)).toEqual(['epoch.current'])

    await user.click(screen.getByRole('button', { name: 'All proofs' }))
    await user.click(await screen.findByRole('button', { name: 'Export all (2)' }))
    const all = JSON.parse(await urls[1]!.text()) as { proofs: unknown[] }
    expect(all.proofs).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('says so when the proof is no longer held, and when none is', async () => {
    await renderInApp(<ProofInspector />)
    act(() => {
      openProofList('proof-gone')
    })
    expect(await screen.findByText('This proof is no longer held')).toBeInTheDocument()
    act(() => {
      openProofList()
    })
    expect(await screen.findByText('No proofs yet')).toBeInTheDocument()
  })

  it('lists a proof that did not verify, from the request log', async () => {
    queryLog.push({
      net: 'mainnet',
      source: 'sdk',
      what: 'identities.fetch',
      ok: false,
      kind: 'proof-failed',
      tookMs: 3,
    })
    await renderInApp(<ProofInspector />)
    act(() => {
      openProofList()
    })
    expect(await screen.findByText('Proofs that did not verify')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('closes with Escape, and a mark clicked afterwards opens it again', async () => {
    const user = userEvent.setup()
    const held = proofStore.put(record('epoch.current', 10))
    await renderInApp(<ProofInspector />)
    act(() => {
      openProofInspector({ id: held.id } as never)
    })
    await screen.findByRole('dialog', { name: 'Proof inspector' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(panelsState().proof.open).toBe(false))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      openProofInspector({ id: held.id } as never)
    })
    expect(await screen.findByRole('dialog', { name: 'Proof inspector' })).toBeInTheDocument()
  })
})
