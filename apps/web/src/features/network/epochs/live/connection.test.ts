import { describe, expect, it } from 'vitest'
import {
  CONNECT_GRACE_MS,
  liveKind,
  nextSetsReadAt,
  QUIET_MIN_MS,
  SETS_MIN_GAP_MS,
  SETS_TRIES_PER_BLOCK,
  SILENT_AFTER_MS,
  type LiveInputs,
} from './connection'

const NOW = 1_000_000_000
const base: LiveInputs = {
  now: NOW,
  startedAt: NOW - 5_000,
  lastOkAt: NOW - 2_000,
  failing: false,
  online: true,
  visible: true,
  tipTimeMs: NOW - 30_000,
  blockMs: 120_000,
}

describe('liveKind', () => {
  it('is live while reads answer and the newest block is recent', () => {
    expect(liveKind(base)).toBe('live')
  })

  it('is connecting until the first read answers, then paused if none does in time', () => {
    const first = { ...base, lastOkAt: undefined, tipTimeMs: undefined }
    expect(liveKind(first)).toBe('connecting')
    expect(liveKind({ ...first, startedAt: NOW - CONNECT_GRACE_MS - 1 })).toBe('paused')
    expect(liveKind({ ...first, failing: true })).toBe('paused')
  })

  it('pauses when a read fails, and recovers with the next answer', () => {
    expect(liveKind({ ...base, failing: true })).toBe('paused')
    expect(liveKind({ ...base, failing: false, lastOkAt: NOW })).toBe('live')
  })

  it('pauses when no read has answered for a while on a visible page, but not on a hidden one', () => {
    const silent = { ...base, lastOkAt: NOW - SILENT_AFTER_MS - 1 }
    expect(liveKind(silent)).toBe('paused')
    expect(liveKind({ ...silent, visible: false })).toBe('live')
  })

  it('pauses while the browser is offline, whatever the reads said last', () => {
    expect(liveKind({ ...base, online: false })).toBe('paused')
  })

  it('calls a chain quiet when reads answer but the newest block is old for its pace', () => {
    expect(liveKind({ ...base, tipTimeMs: NOW - 6 * 120_000 - 1 })).toBe('quiet')
    expect(liveKind({ ...base, tipTimeMs: NOW - 5 * 120_000 })).toBe('live')
    // A fast chain still gets a few minutes before it is called quiet.
    const fast = { ...base, blockMs: 8_000 }
    expect(liveKind({ ...fast, tipTimeMs: NOW - QUIET_MIN_MS + 1 })).toBe('live')
    expect(liveKind({ ...fast, tipTimeMs: NOW - QUIET_MIN_MS - 1 })).toBe('quiet')
  })
})

describe('nextSetsReadAt', () => {
  const at = {
    now: NOW,
    tipHeight: 101,
    setsHeight: 100,
    lastReadAt: NOW - 60_000,
    triesForTip: 0,
    paused: false,
  }

  it('reads again at once when a block landed and the last read is not recent', () => {
    expect(nextSetsReadAt(at)).toBe(NOW)
  })

  it('waits out the gap after the last read', () => {
    expect(nextSetsReadAt({ ...at, lastReadAt: NOW - 1_000 })).toBe(NOW - 1_000 + SETS_MIN_GAP_MS)
  })

  it('does not read while the order is as new as the newest block', () => {
    expect(nextSetsReadAt({ ...at, setsHeight: 101 })).toBeUndefined()
    expect(nextSetsReadAt({ ...at, setsHeight: 102 })).toBeUndefined()
  })

  it('stops asking about one block after a few tries, and while paused', () => {
    expect(nextSetsReadAt({ ...at, triesForTip: SETS_TRIES_PER_BLOCK })).toBeUndefined()
    expect(nextSetsReadAt({ ...at, paused: true })).toBeUndefined()
    expect(nextSetsReadAt({ ...at, tipHeight: undefined })).toBeUndefined()
  })

  it('reads the first time with no order yet', () => {
    expect(nextSetsReadAt({ ...at, setsHeight: undefined, lastReadAt: undefined })).toBe(NOW)
  })
})
