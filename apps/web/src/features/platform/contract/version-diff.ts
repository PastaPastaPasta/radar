export type ChangeKind = 'added' | 'removed' | 'changed'

export interface Change {
  /** Where the change is, from the root of the compared object. */
  path: string[]
  kind: ChangeKind
  before?: unknown
  after?: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * What differs between two versions of a JSON value, one entry per leaf that was added, removed or changed. Arrays
 * are compared whole, so a reordered or edited index shows as one change at the array.
 */
export function diffJson(before: unknown, after: unknown, path: string[] = []): Change[] {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys.flatMap((key) => {
      const next = [...path, key]
      if (!(key in before)) return [{ path: next, kind: 'added' as const, after: after[key] }]
      if (!(key in after)) return [{ path: next, kind: 'removed' as const, before: before[key] }]
      return diffJson(before[key], after[key], next)
    })
  }
  return same(before, after) ? [] : [{ path, kind: 'changed', before, after }]
}

/** `/domain/properties/label`: a path as text, `/` and `~` inside a name escaped as `~1` and `~0`. */
export const pointerOf = (path: readonly string[]): string =>
  path.map((p) => `/${p.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')

export function pathOfPointer(pointer: string | undefined): string[] {
  if (!pointer) return []
  return pointer
    .split('/')
    .slice(1)
    .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'))
}

/** The value at a path, or `undefined` when the path leaves the value. */
export function valueAt(root: unknown, path: readonly string[]): unknown {
  let node = root
  for (const key of path) {
    if (Array.isArray(node)) {
      const index = Number(key)
      node = Number.isInteger(index) ? node[index] : undefined
    } else if (isObject(node)) {
      node = node[key]
    } else {
      return undefined
    }
    if (node === undefined) return undefined
  }
  return node
}
