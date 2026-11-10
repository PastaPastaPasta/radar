import { describe, expect, it } from 'vitest'
import { SourceError, type SourceErrorKind } from '../errors'
import { queryDefaults, retryDelay, retryable } from './defaults'

const err = (kind: SourceErrorKind, extra: { status?: number; retryAfterMs?: number } = {}) =>
  new SourceError({ source: 'pe', kind, message: kind, ...extra })

describe('retry policy', () => {
  it.each([
    ['network', true],
    ['timeout', true],
    ['rate-limited', true],
    ['invalid-response', false],
    ['proof-failed', false],
    ['unavailable', false],
    ['aborted', false],
  ] as const)('%s → %s', (kind, expected) => {
    expect(retryable(err(kind))).toBe(expected)
  })

  it('retries http 5xx but not 4xx', () => {
    expect(retryable(err('http', { status: 503 }))).toBe(true)
    expect(retryable(err('http', { status: 500 }))).toBe(true)
    expect(retryable(err('http', { status: 400 }))).toBe(false)
    expect(retryable(err('http', { status: 404 }))).toBe(false)
  })

  it('does not retry unknown errors', () => {
    expect(retryable(new Error('boom'))).toBe(false)
  })

  it('backs off 1 s, 2 s, 4 s and honours Retry-After', () => {
    expect(retryDelay(0, err('network'))).toBe(1000)
    expect(retryDelay(1, err('network'))).toBe(2000)
    expect(retryDelay(2, err('network'))).toBe(4000)
    expect(retryDelay(0, err('rate-limited', { retryAfterMs: 7000 }))).toBe(7000)
  })

  it('stops after two retries', () => {
    const retry = queryDefaults.queries?.retry as (n: number, e: unknown) => boolean
    expect(retry(0, err('network'))).toBe(true)
    expect(retry(1, err('network'))).toBe(true)
    expect(retry(2, err('network'))).toBe(false)
  })

  it('turns focus refetching off globally and never polls hidden tabs', () => {
    expect(queryDefaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(queryDefaults.queries?.refetchIntervalInBackground).toBe(false)
  })
})
