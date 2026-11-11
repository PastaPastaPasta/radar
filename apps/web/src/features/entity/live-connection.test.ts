import { describe, expect, it } from 'vitest'
import { connectionOf } from './live-connection'

describe('connectionOf', () => {
  const at = 1_000
  it('treats a stream nobody opened as live, and a stopped one as stopped since its last event @IN-15', () => {
    expect(connectionOf({ state: 'idle', since: 0 }, true, undefined, at).state).toBe('live')
    expect(connectionOf({ state: 'connecting', since: 0 }, true, undefined, at).state).toBe(
      'connecting',
    )
    expect(
      connectionOf({ state: 'stopped', since: 5, lastEventAt: 3 }, true, undefined, at),
    ).toEqual({ state: 'stopped', lastEventAt: 3 })
  })

  it('stops at once when the browser is offline, from the moment it went offline @IN-15', () => {
    expect(connectionOf({ state: 'live', since: 0, lastEventAt: 7 }, false, 500, at)).toEqual({
      state: 'stopped',
      lastEventAt: 500,
    })
    expect(connectionOf({ state: 'live', since: 0 }, true, 500, at).state).toBe('live')
  })
})
