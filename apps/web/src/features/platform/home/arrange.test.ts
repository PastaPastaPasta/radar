import { describe, expect, it } from 'vitest'
import { FULL_ROWS, arrangeBoards, pairRows } from './arrange'

const b = (id: string, rows: number | undefined, pinned = false) => ({ id, rows, pinned })
const ids = (bs: readonly { id: string }[]) => bs.map((x) => x.id)

describe('arrangeBoards @NX-01 @PE-05', () => {
  it('pairs four full boards and leaves no short row', () => {
    const a = arrangeBoards([
      b('ids', 50),
      b('rich', 50, true),
      b('contracts', 50),
      b('tokens', 50),
    ])
    expect(ids(a.full)).toEqual(['ids', 'rich', 'contracts', 'tokens'])
    expect(a.wide).toBeUndefined()
    expect(a.short).toEqual([])
  })

  it('moves a board with a few rows to the short row and lets the odd full board take its row', () => {
    // mainnet: two tokens moved in the last 30 days
    const a = arrangeBoards([b('ids', 50), b('rich', 50, true), b('contracts', 16), b('tokens', 2)])
    expect(ids(a.full)).toEqual(['ids', 'rich'])
    expect(a.wide?.id).toBe('contracts')
    expect(ids(a.short)).toEqual(['tokens'])
  })

  it('keeps an empty board in the short row, where it says so, instead of dropping it', () => {
    const a = arrangeBoards([b('ids', 0), b('rich', 50, true), b('contracts', 0), b('tokens', 3)])
    expect(a.full).toEqual([])
    expect(a.wide?.id).toBe('rich')
    expect(ids(a.short)).toEqual(['ids', 'contracts', 'tokens'])
  })

  it('keeps a pinned board full whatever its rows', () => {
    const a = arrangeBoards([b('rich', 1, true), b('ids', 2)])
    expect(a.wide?.id).toBe('rich')
    expect(ids(a.short)).toEqual(['ids'])
  })

  it('holds a full place for a board whose answer is not in, so the skeletons keep the shape', () => {
    const a = arrangeBoards([
      b('ids', undefined),
      b('rich', undefined, true),
      b('contracts', undefined),
      b('tokens', undefined),
    ])
    expect(ids(a.full)).toHaveLength(4)
    expect(a.short).toEqual([])
  })

  it(`needs ${FULL_ROWS} rows for a full board`, () => {
    expect(ids(arrangeBoards([b('a', FULL_ROWS), b('b', FULL_ROWS - 1)]).short)).toEqual(['b'])
  })
})

describe('pairRows @NX-01', () => {
  it('cuts a board to its partner so the two end on one line', () => {
    expect(pairRows(50, 7, 10)).toBe(7)
    expect(pairRows(7, 50, 10)).toBe(7)
    expect(pairRows(50, 50, 10)).toBe(10)
  })

  it('shows its own top when it has no partner or the partner is still loading', () => {
    expect(pairRows(50, undefined, 10)).toBe(10)
    expect(pairRows(6, undefined, 10)).toBe(6)
  })
})
