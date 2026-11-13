import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { writeSourceMode } from '@/lib/source-mode'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
  writeSourceMode('all')
})

describe('Votes page', () => {
  it('lists masternode votes with their choice @PE-21', async () => {
    renderAt('/votes')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
    })
  })

  it('says it needs Platform Explorer in Decentralized only mode @PE-21', async () => {
    renderAt('/votes?sources=decentralized')
    await waitFor(() => {
      expect(document.querySelector('[data-unavailable]') ?? document.querySelector('[role="status"]')).not.toBeNull()
    })
    expect(document.querySelectorAll('tbody tr').length).toBe(0)
  })
})
