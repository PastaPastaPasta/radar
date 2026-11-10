import { redirect } from '@tanstack/react-router'
import { parseNetworkParam } from '@/lib/network'

export interface RedirectTarget {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  hash?: string
  replace?: boolean
}

/** Redirects are thrown objects, not Errors, and don't inherit the current `network`, so it is passed on. */
export function throwRedirect(
  target: RedirectTarget,
  current: { network?: string; net?: string } = {},
): never {
  const { net } = parseNetworkParam(current.network, current.net)
  const network = net === 'mainnet' ? undefined : net
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw redirect({ ...target, search: { ...target.search, network }, replace: true } as never)
}
