import { describe, expect, it } from 'vitest'
import { RadarActivationSchema, v24Pending } from '@/data/radar/schemas'
import mainnet from '@/test/fixtures/http/radar/mainnet/activation.json'
import testnet from '@/test/fixtures/http/radar/testnet/activation.json'
import { milestones, thresholdRows, v24Of, windowProgress, windowSlots } from './v24-math'

const mainnetDoc = RadarActivationSchema.parse(mainnet.body)
const testnetDoc = RadarActivationSchema.parse(testnet.body)

describe('milestones', () => {
  it('lists the road while waiting for the signal, with the passed start time done', () => {
    const d = v24Of(mainnetDoc)!
    const road = milestones(d, d.outlook)
    expect(road.map((m) => m.id)).toEqual([
      'start-time',
      'signal',
      'first-window',
      'lock-in',
      'activation',
    ])
    expect(road.map((m) => m.done)).toEqual([true, false, false, false, false])
  })

  it('lists the finished road once active', () => {
    const d = v24Of(testnetDoc)!
    const road = milestones(d, d.outlook)
    expect(road.map((m) => m.id)).toEqual(['signal', 'locked-in', 'active'])
    expect(road.every((m) => m.done)).toBe(true)
    expect(road[1]!.block!.height).toBe(1_578_000 - 100)
  })
})

describe('windowProgress', () => {
  it('counts signalling blocks and projects the pace to the window’s end', () => {
    const p = windowProgress(
      {
        count: 2,
        mined: 4,
        start: { height: 0 },
        end: { height: 9 },
        signalling: '#-#-',
      },
      10,
    )
    expect(p.cumulative).toEqual([0, 1, 1, 2, 2])
    expect(p.mined).toBe(4)
    expect(p.projected).toBe(5)
  })
})

describe('window slots and threshold rows', () => {
  it('dates windows to come from the earliest start, one pace apart, until the threshold bottoms out', () => {
    const d = v24Of(mainnetDoc)!
    const slots = windowSlots(d, mainnetDoc.block_seconds)
    expect(slots.length).toBeGreaterThan(5)
    expect(slots.every((s) => s.future)).toBe(true)
    expect(slots[0]!.height).toBe(2_572_416)
    expect(slots[1]!.height - slots[0]!.height).toBe(4032)
    expect(slots[0]!.threshold).toBe(3226)
  })

  it('marks no window as current and dates none before the signal on a decided deployment', () => {
    const d = v24Of(testnetDoc)!
    const rows = thresholdRows(d, testnetDoc.block_seconds)
    expect(rows.some((r) => r.now)).toBe(false)
    expect(rows.every((r) => !r.estimated)).toBe(true)
  })

  it('gives the schedule’s thresholds by attempt', () => {
    const d = v24Of(mainnetDoc)!
    const rows = thresholdRows(d, mainnetDoc.block_seconds)
    expect(rows).toHaveLength(d.schedule.length)
    expect(rows[0]).toMatchObject({
      attempt: 0,
      threshold: 3226,
      startHeight: 2_572_416,
      estimated: true,
    })
  })
})

describe('v24Pending', () => {
  const DAY = 86_400_000

  it('is true while the deployment is pending', () => {
    expect(v24Pending(mainnetDoc, Date.now())).toBe(true)
  })

  it('is true for under 30 days after activation and false after', () => {
    const activated = v24Of(testnetDoc)!.outlook.activation!.time! * 1000
    expect(v24Pending(testnetDoc, activated + 29 * DAY)).toBe(true)
    expect(v24Pending(testnetDoc, activated + 31 * DAY)).toBe(false)
  })

  it('is false without the document or a v24 deployment', () => {
    expect(v24Pending(undefined, 0)).toBe(false)
    expect(v24Pending({ ...mainnetDoc, deployments: [] }, 0)).toBe(false)
  })
})
