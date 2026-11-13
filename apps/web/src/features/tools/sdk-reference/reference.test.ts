import { describe, expect, it } from 'vitest'
import { sdkQueries } from '@/data/sdk/queries'
import { SITE_MAP } from '@/features/entity'
import { METHOD_PAGES } from './method-pages'
import { filterRows, referenceRows } from './reference'

const methods = Object.keys(sdkQueries).sort()

describe('the SDK reference table', () => {
  it('has a row for every SDK method', () => {
    const missing = methods.filter((m) => !METHOD_PAGES[m])
    expect(missing, `add these methods to method-pages.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('names no method the SDK client lacks', () => {
    expect(Object.keys(METHOD_PAGES).filter((m) => !methods.includes(m))).toEqual([])
  })

  it('gives every method at least one page, and only pages the site map has', () => {
    const paths = new Set(SITE_MAP.map((p) => p.path))
    for (const [method, row] of Object.entries(METHOD_PAGES)) {
      expect(row.pages.length, `${method} has no page`).toBeGreaterThan(0)
      for (const page of row.pages) expect(paths.has(page), `${method}: ${page}`).toBe(true)
      expect(row.call.length).toBeGreaterThan(0)
    }
  })
})

describe('referenceRows', () => {
  const rows = referenceRows()
  it('lists the SDK calls behind a page', () => {
    const query = rows.find((r) => r.path === '/query')
    expect(query?.calls.map((c) => c.method)).toEqual(
      expect.arrayContaining([
        'documents.query',
        'documents.count',
        'documents.sum',
        'documents.average',
      ]),
    )
  })
  it('links only pages without params', () => {
    for (const row of rows) expect(row.linkable).toBe(!row.path.includes('$'))
  })
})

describe('filterRows', () => {
  const rows = referenceRows()
  it('keeps everything for an empty filter', () => {
    expect(filterRows(rows, undefined)).toHaveLength(rows.length)
    expect(filterRows(rows, '  ')).toHaveLength(rows.length)
  })
  it('finds pages by an SDK method', () => {
    const found = filterRows(rows, 'documents.count')
    expect(found.map((r) => r.path)).toContain('/query')
    expect(found.length).toBeLessThan(rows.length)
  })
  it('needs every word to match', () => {
    expect(filterRows(rows, 'documents.count zzzz-nothing')).toEqual([])
  })
})
