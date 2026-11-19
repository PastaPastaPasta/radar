import { describe, expect, it } from 'vitest'
import { FULL_ROWS, arrangeBoards, pairRows } from './arrange'

const b = (id: string, rows: number | undefined, pinned = false) => ({ id, rows, pinned })
const TOP = 10

/** The placements in page order, as `id:group:span:shown`. */
const layout = (boards: ReturnType<typeof b>[]) =>
  [...arrangeBoards(boards, TOP)]
    .sort(([, x], [, y]) => x.order - y.order)
    .map(([id, p]) => `${id}:${p.group}:${p.span}:${p.shown}`)

describe('arrangeBoards @NX-01 @PE-05', () => {
  it('pairs four full boards, ten rows each', () => {
    expect(
      layout([b('ids', 50), b('rich', 50, true), b('contracts', 50), b('tokens', 50)]),
    ).toEqual(['ids:full:1:10', 'rich:full:1:10', 'contracts:full:1:10', 'tokens:full:1:10'])
  })

  it('puts a board with a few rows after the full ones and lets the odd full board take its row', () => {
    // mainnet: two tokens moved in the last 30 days
    expect(layout([b('ids', 50), b('rich', 50, true), b('contracts', 16), b('tokens', 2)])).toEqual(
      ['ids:full:1:10', 'rich:full:1:10', 'contracts:full:2:10', 'tokens:short:2:2'],
    )
  })

  it('keeps an empty board, where it says so, instead of dropping it', () => {
    expect(layout([b('ids', 0), b('rich', 50, true), b('contracts', 0), b('tokens', 3)])).toEqual([
      'rich:full:2:10',
      'ids:short:1:0',
      'contracts:short:1:0',
      'tokens:short:2:3',
    ])
  })

  it('ends a pinned board with a few rows level with its partner', () => {
    expect(layout([b('ids', 50), b('rich', 3, true)])).toEqual(['ids:full:1:3', 'rich:full:1:3'])
    // with none, it draws one row of "nothing", and its partner one row
    expect(layout([b('ids', 50), b('rich', 0, true)])).toEqual(['ids:full:1:1', 'rich:full:1:1'])
  })

  it('holds a full place for a board whose answer is not in, so the skeletons keep the shape', () => {
    expect(
      layout([b('ids', undefined), b('rich', undefined, true), b('contracts', 7), b('tokens', 20)]),
    ).toEqual(['ids:full:1:10', 'rich:full:1:10', 'contracts:full:1:7', 'tokens:full:1:7'])
  })

  it('answers in the boards’ own order, so the page never reorders its DOM', () => {
    const placed = arrangeBoards([b('ids', 1), b('rich', 50, true), b('tokens', 9)], TOP)
    expect([...placed.keys()]).toEqual(['ids', 'rich', 'tokens'])
    expect(placed.get('ids')!.order).toBe(2)
  })

  it(`needs ${FULL_ROWS} rows for a full board`, () => {
    const placed = arrangeBoards([b('a', FULL_ROWS), b('b', FULL_ROWS - 1)], TOP)
    expect(placed.get('a')!.group).toBe('full')
    expect(placed.get('b')!.group).toBe('short')
  })
})

describe('pairRows @NX-01', () => {
  it('cuts a board to its partner so the two end on one line', () => {
    expect(pairRows(50, 7, 10)).toBe(7)
    expect(pairRows(7, 50, 10)).toBe(7)
    expect(pairRows(50, 50, 10)).toBe(10)
    expect(pairRows(50, 3, 10)).toBe(3)
  })

  it('shows its own top while it or its partner is still loading', () => {
    expect(pairRows(50, undefined, 10)).toBe(10)
    expect(pairRows(6, undefined, 10)).toBe(6)
    expect(pairRows(undefined, 4, 10)).toBe(10)
  })
})
