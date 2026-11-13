import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearViewed,
  forgetViewed,
  recordViewedIdentity,
  setViewedEnabled,
  useViewedEnabled,
  useViewedIdentities,
  VIEWED_KEY,
  VIEWED_LIMIT,
} from './viewed'

beforeEach(() => {
  localStorage.clear()
  forgetViewed()
})

const stored = () => localStorage.getItem(VIEWED_KEY)

describe('viewed identities @YOU', () => {
  it('records nothing and writes nothing until it is turned on', () => {
    recordViewedIdentity('mainnet', 'a')
    expect(stored()).toBeNull()
  })

  it('keeps the newest first, one entry per identity, per network', () => {
    setViewedEnabled(true)
    recordViewedIdentity('mainnet', 'a', 1)
    recordViewedIdentity('mainnet', 'b', 2)
    recordViewedIdentity('testnet', 'a', 3)
    recordViewedIdentity('mainnet', 'a', 4)
    function List({ net }: { net: 'mainnet' | 'testnet' }) {
      return (
        <p>{`${net}: ${useViewedIdentities(net)
          .map((v) => v.id)
          .join(',')}`}</p>
      )
    }
    render(
      <>
        <List net="mainnet" />
        <List net="testnet" />
      </>,
    )
    expect(screen.getByText('mainnet: a,b')).toBeInTheDocument()
    expect(screen.getByText('testnet: a')).toBeInTheDocument()
  })

  it('keeps at most 50 per network and leaves the other networks alone', () => {
    setViewedEnabled(true)
    recordViewedIdentity('testnet', 'keep')
    for (let i = 0; i < VIEWED_LIMIT + 5; i++) recordViewedIdentity('mainnet', `id${String(i)}`, i)
    const items = (JSON.parse(stored() ?? '{}') as { items: { net: string; id: string }[] }).items
    const mainnet = items.filter((i) => i.net === 'mainnet')
    expect(mainnet).toHaveLength(VIEWED_LIMIT)
    expect(mainnet[0]?.id).toBe(`id${String(VIEWED_LIMIT + 4)}`)
    expect(mainnet.some((i) => i.id === 'id0')).toBe(false)
    expect(items.filter((i) => i.net === 'testnet')).toHaveLength(1)
  })

  it('forgets the list when it is turned off, and clears on request', () => {
    setViewedEnabled(true)
    recordViewedIdentity('mainnet', 'a')
    clearViewed()
    expect(JSON.parse(stored() ?? '{}')).toEqual({ on: true, items: [] })
    recordViewedIdentity('mainnet', 'b')
    setViewedEnabled(false)
    recordViewedIdentity('mainnet', 'c')
    expect(JSON.parse(stored() ?? '{}')).toEqual({ on: false, items: [] })
  })

  it('shows the setting and follows another tab', () => {
    function Flag() {
      return <p>{useViewedEnabled() ? 'on' : 'off'}</p>
    }
    render(<Flag />)
    expect(screen.getByText('off')).toBeInTheDocument()
    localStorage.setItem(VIEWED_KEY, JSON.stringify({ on: true, items: [] }))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: VIEWED_KEY }))
    })
    expect(screen.getByText('on')).toBeInTheDocument()
  })

  it('reads damaged storage as off', () => {
    localStorage.setItem(VIEWED_KEY, '[1,2')
    forgetViewed()
    recordViewedIdentity('mainnet', 'a')
    expect(stored()).toBe('[1,2')
  })
})
