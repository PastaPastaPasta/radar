import { describe, expect, it } from 'vitest'
import { concentrationOption } from './chart-option'

const input = {
  labels: ['Top 1', 'Top 2–5', 'Top 6–10', 'Top 11–25', 'Top 26–50', 'Top 51–100'],
  shares: [0.07, 0.1, 0.05, 0.08, 0.06, 0.04],
  name: 'Share of supply',
}

describe('concentrationOption @HY-09', () => {
  it('lays the bands out as labelled rows on a phone, every label shown', () => {
    const option = concentrationOption({ ...input, phone: true })
    const y = option.yAxis as {
      type: string
      data: string[]
      inverse: boolean
      axisLabel: { interval: number }
    }
    expect(y.type).toBe('category')
    expect(y.data).toEqual(input.labels)
    expect(y.axisLabel.interval).toBe(0)
    expect(y.inverse).toBe(true)
    expect((option.xAxis as { type: string }).type).toBe('value')
  })

  it('keeps columns on a wider screen', () => {
    const option = concentrationOption({ ...input, phone: false })
    expect((option.xAxis as { type: string }).type).toBe('category')
  })
})
