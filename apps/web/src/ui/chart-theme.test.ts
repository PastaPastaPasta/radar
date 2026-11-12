import { describe, expect, it } from 'vitest'
import { withEdgeRoom } from './chart-theme'

const option = (data: (string | number)[], right = 12) => ({
  grid: { left: 8, right, top: 16, bottom: 28, containLabel: true },
  xAxis: { type: 'category' as const, data },
})

describe('withEdgeRoom', () => {
  it('keeps half the widest category label free beside the right edge', () => {
    const out = withEdgeRoom(option(['2,570,328', '2,570,838']))
    expect(out.grid).toMatchObject({ right: 37 })
  })

  it('leaves a grid that already has the room alone', () => {
    const o = option(['Top 10'], 40)
    expect(withEdgeRoom(o)).toBe(o)
  })

  it('passes options with no category data through', () => {
    const o = { grid: { right: 8 }, xAxis: { type: 'value' as const } }
    expect(withEdgeRoom(o)).toBe(o)
  })
})
