import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAnnouncer } from '@/ui/announce'
import { SaveButton } from './SaveButton'
import { renderInApp } from './test-utils'
import {
  clearSaved,
  forgetSaved,
  isSaved,
  removeItem,
  saveItem,
  SAVED_KEY,
  useSaved,
} from './saved'

const ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

beforeEach(() => {
  localStorage.clear()
  forgetSaved()
})
afterEach(() => {
  vi.restoreAllMocks()
  resetAnnouncer()
})

describe('saved items @YOU', () => {
  it('saves newest first, keeps one copy per network and kind, and removes', () => {
    saveItem({ net: 'mainnet', kind: 'identity', id: ID }, 1)
    saveItem({ net: 'mainnet', kind: 'token', id: 't1', label: 'Token' }, 2)
    saveItem({ net: 'testnet', kind: 'identity', id: ID }, 3)
    saveItem({ net: 'mainnet', kind: 'identity', id: ID, label: 'alice.dash' }, 4)
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { id: string }[]
    expect(list.map((i) => i.id)).toEqual([ID, ID, 't1'])
    expect(isSaved({ net: 'mainnet', kind: 'identity', id: ID })).toBe(true)
    expect(isSaved({ net: 'testnet', kind: 'token', id: ID })).toBe(false)

    removeItem({ net: 'testnet', kind: 'identity', id: ID })
    expect(isSaved({ net: 'testnet', kind: 'identity', id: ID })).toBe(false)
    expect(isSaved({ net: 'mainnet', kind: 'identity', id: ID })).toBe(true)
  })

  it('clears by network, by kind, or everything', () => {
    const add = () => {
      saveItem({ net: 'mainnet', kind: 'identity', id: 'a' })
      saveItem({ net: 'mainnet', kind: 'token', id: 'b' })
      saveItem({ net: 'testnet', kind: 'identity', id: 'c' })
    }
    const ids = () =>
      (JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { id: string }[]).map((i) => i.id)
    add()
    clearSaved({ net: 'mainnet' })
    expect(ids()).toEqual(['c'])
    clearSaved()
    add()
    clearSaved({ kind: 'identity' })
    expect(ids()).toEqual(['b'])
    add()
    clearSaved({ net: 'mainnet', kind: 'identity' })
    expect(ids().sort()).toEqual(['b', 'c'])
    clearSaved({})
    expect(ids()).toEqual([])
  })

  it('drops entries that are not saved items', () => {
    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify([
        { net: 'mainnet', kind: 'identity', id: 'ok', savedAt: 5 },
        { net: 'nowhere', kind: 'identity', id: 'bad-net' },
        { net: 'mainnet', kind: 'proposal', id: 'bad-kind' },
        { net: 'devnet-x1', kind: 'contract', id: 'dev', label: 7 },
        'junk',
      ]),
    )
    forgetSaved()
    function List() {
      return (
        <p>
          {useSaved()
            .map((s) => `${s.net}:${s.kind}:${s.id}`)
            .join(',')}
        </p>
      )
    }
    render(<List />)
    expect(screen.getByText('mainnet:identity:ok,devnet-x1:contract:dev')).toBeInTheDocument()
  })

  it('follows another tab', () => {
    function Count() {
      return <p>{`saved ${String(useSaved().length)}`}</p>
    }
    render(<Count />)
    expect(screen.getByText('saved 0')).toBeInTheDocument()
    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify([{ net: 'mainnet', kind: 'token', id: 'z', savedAt: 1 }]),
    )
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVED_KEY }))
    })
    expect(screen.getByText('saved 1')).toBeInTheDocument()
  })
})

describe('SaveButton @YOU', () => {
  it('toggles the item on the page’s network and says so', async () => {
    await renderInApp(
      <SaveButton kind="identity" id={ID} label="alice.dash" />,
      '/?network=testnet',
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(isSaved({ net: 'testnet', kind: 'identity', id: ID })).toBe(true)
    expect(isSaved({ net: 'mainnet', kind: 'identity', id: ID })).toBe(false)
    expect(
      (JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { label?: string }[])[0]?.label,
    ).toBe('alice.dash')
    await vi.waitFor(() => {
      expect(document.getElementById('rx-announcer')).toHaveTextContent('Saved')
    })

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await vi.waitFor(() => {
      expect(document.getElementById('rx-announcer')).toHaveTextContent('Removed from saved')
    })
  })
})
