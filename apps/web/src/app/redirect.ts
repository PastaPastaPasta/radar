import { redirect } from '@tanstack/react-router'

export interface RedirectTarget {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  hash?: string
  replace?: boolean
}

/** Redirects are thrown objects, not Errors, and don't inherit the current `network`, so it is passed on. */
export function throwRedirect(target: RedirectTarget, network?: string): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw redirect({ ...target, search: { ...target.search, network }, replace: true } as never)
}
