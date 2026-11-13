import { describe, expect, it } from 'vitest'
import { diffJson, pathOfPointer, pointerOf, valueAt } from './version-diff'

describe('diffJson', () => {
  it('names each added, removed and changed leaf by its path', () => {
    const before = {
      domain: {
        properties: { label: { type: 'string', maxLength: 63 }, gone: { type: 'string' } },
      },
      config: { keepsHistory: true },
    }
    const after = {
      domain: {
        properties: { label: { type: 'string', maxLength: 64 }, extra: { type: 'integer' } },
      },
      config: { keepsHistory: true },
      note: { type: 'object' },
    }
    expect(diffJson(before, after)).toEqual([
      { path: ['domain', 'properties', 'extra'], kind: 'added', after: { type: 'integer' } },
      { path: ['domain', 'properties', 'gone'], kind: 'removed', before: { type: 'string' } },
      {
        path: ['domain', 'properties', 'label', 'maxLength'],
        kind: 'changed',
        before: 63,
        after: 64,
      },
      { path: ['note'], kind: 'added', after: { type: 'object' } },
    ])
  })

  it('compares an array whole, so one edited index is one change', () => {
    const changes = diffJson(
      { indices: [{ name: 'a' }] },
      { indices: [{ name: 'a' }, { name: 'b' }] },
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ path: ['indices'], kind: 'changed' })
  })

  it('finds nothing between equal values', () => {
    expect(diffJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
  })
})

describe('schema paths', () => {
  it('round trips a path with a slash and a tilde in a name', () => {
    const path = ['domain', 'properties', 'a/b', 'c~d']
    expect(pathOfPointer(pointerOf(path))).toEqual(path)
    expect(pointerOf(['domain', 'properties'])).toBe('/domain/properties')
  })

  it('reads a value along a path through objects and arrays', () => {
    const root = { domain: { indices: [{ name: 'x' }] } }
    expect(valueAt(root, ['domain', 'indices', '0', 'name'])).toBe('x')
    expect(valueAt(root, ['domain', 'missing', 'deeper'])).toBeUndefined()
    expect(pathOfPointer(undefined)).toEqual([])
  })
})
