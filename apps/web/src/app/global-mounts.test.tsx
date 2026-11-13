import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProofMeta } from '@/data/envelope'
import { openProofInspector, registerProofInspector } from '@/ui/proof'
import { GlobalMounts, requestGlobalMount, resetGlobalMounts } from './global-mounts'

const loaded = vi.hoisted(() => ({ count: 0, opened: [] as string[], fail: false }))

vi.mock('@/features/you/proof/ProofInspector', async () => {
  const { useEffect: effect } = await import('react')
  const { registerProofInspector: register } = await import('@/ui/proof')
  loaded.count += 1
  return {
    ProofInspector: function ProofInspector() {
      effect(() => register((p) => loaded.opened.push(p.id)), [])
      return <p>proof inspector</p>
    },
  }
})

vi.mock('@/features/you/diagnostics/Diagnostics', () => {
  loaded.count += 1
  return {
    Diagnostics: function Diagnostics() {
      if (loaded.fail) throw new Error('the panel broke')
      return <p>diagnostics</p>
    },
  }
})

const proof = { id: 'p1' } as ProofMeta

beforeEach(() => {
  loaded.opened.length = 0
  loaded.fail = false
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

  it('keeps the app when a panel breaks, and lets a later request start it afresh', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    loaded.fail = true
    render(<GlobalMounts />)
    act(() => {
      requestGlobalMount('diagnostics')
    })
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalled()
    })
    expect(screen.queryByText('diagnostics')).not.toBeInTheDocument()

    loaded.fail = false
    act(() => {
      requestGlobalMount('diagnostics')
    })
    expect(await screen.findByText('diagnostics')).toBeInTheDocument()
    error.mockRestore()
  })

  it('does not let a stale inspector unregister a newer one', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerProofInspector(first)
    registerProofInspector(second)
    unregisterFirst()
    openProofInspector(proof)
    expect(second).toHaveBeenCalledWith(proof)
    expect(first).not.toHaveBeenCalled()
  })

  it('does nothing for a proof mark when the shell is not mounted', () => {
    openProofInspector(proof)
    expect(loaded.opened).toEqual([])
  })
})
