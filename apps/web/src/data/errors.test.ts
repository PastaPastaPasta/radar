import { describe, expect, it } from 'vitest'
import { isSourceError, SourceError } from './errors'

describe('SourceError', () => {
  it('carries its fields', () => {
    const cause = new Error('boom')
    const e = new SourceError({
      source: 'dapi',
      kind: 'rate-limited',
      message: 'slow down',
      status: 8,
      retryAfterMs: 5000,
      node: '1.2.3.4:443',
      cause,
    })
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('SourceError')
    expect(e.message).toBe('slow down')
    expect(e).toMatchObject({
      source: 'dapi',
      kind: 'rate-limited',
      status: 8,
      retryAfterMs: 5000,
      node: '1.2.3.4:443',
    })
    expect(e.cause).toBe(cause)
  })

  it('leaves optional fields undefined', () => {
    const e = new SourceError({ source: 'pe', kind: 'timeout', message: 'late' })
    expect(e.status).toBeUndefined()
    expect(e.cause).toBeUndefined()
  })
})

describe('isSourceError', () => {
  it('narrows only SourceError instances', () => {
    expect(isSourceError(new SourceError({ source: 'rate', kind: 'http', message: 'x' }))).toBe(
      true,
    )
    expect(isSourceError(new Error('x'))).toBe(false)
    expect(isSourceError({ kind: 'http' })).toBe(false)
    expect(isSourceError(null)).toBe(false)
  })
})
