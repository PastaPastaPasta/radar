import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProofMeta } from '@/data/envelope'
import { openProofInspector, registerProofInspector } from '@/ui/proof'
import { GlobalMounts, requestGlobalMount, resetGlobalMounts } from './global-mounts'

const loaded = vi.hoisted(() => ({ count: 0, opened: [] as string[] }))

vi.mock('@/features/you', async () => {
  const { useEffect: effect } = await import('react')
  const { registerProofInspector: register } = await import('@/ui/proof')
  loaded.count += 1
  return {
    ProofInspectorMount: function ProofInspectorMount() {
      effect(() => {
        register((p) => loaded.opened.push(p.id))
        return () => register(undefined)
      }, [])
      return <p>proof inspector</p>
    },
    DiagnosticsMount: function DiagnosticsMount() {
      return <p>diagnostics</p>
    },
  }
})

const proof = { id: 'p1' } as ProofMeta

beforeEach(() => {
  loaded.opened.length = 0
})
afterEach(() => {
  resetGlobalMounts()
  registerProofInspector(undefined)
})

describe('GlobalMounts', () => {
  it('loads and draws nothing until a panel is asked for', async () => {
    render(<GlobalMounts />)
    expect(loaded.count).toBe(0)
    expect(screen.queryByText('diagnostics')).not.toBeInTheDocument()

    act(() => {
      requestGlobalMount('diagnostics')
    })
    expect(await screen.findByText('diagnostics')).toBeInTheDocument()
    expect(loaded.count).toBe(1)
    expect(screen.queryByText('proof inspector')).not.toBeInTheDocument()
  })

  it('opens the proof inspector from a mark pressed before it was mounted', async () => {
    render(<GlobalMounts />)
    act(() => {
      openProofInspector(proof)
    })
    expect(await screen.findByText('proof inspector')).toBeInTheDocument()
    expect(loaded.opened).toEqual(['p1'])

    openProofInspector({ ...proof, id: 'p2' })
    expect(loaded.opened).toEqual(['p1', 'p2'])
  })

  it('does nothing for a proof mark when the shell is not mounted', () => {
    openProofInspector(proof)
    expect(loaded.opened).toEqual([])
  })
})
