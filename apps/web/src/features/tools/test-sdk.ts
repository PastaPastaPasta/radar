import { vi } from 'vitest'
import { sdk } from '@/data/sdk'
import type { SdkMethodName } from '@/data/sdk'

/** An SDK answer as the client stamps it. */
export function sourced<T>(data: T) {
  const now = Date.now()
  return { source: 'sdk' as const, asOf: now, fetchedAt: now, proved: false, data }
}

/** Replaces `sdk.call` with per-method answers; a method with no answer fails the test loudly. */
export function stubSdkCalls(answers: Partial<Record<SdkMethodName, (args: never) => unknown>>) {
  return vi.spyOn(sdk, 'call').mockImplementation(((
    _net: string,
    method: SdkMethodName,
    args: never,
  ) => {
    const answer = answers[method]
    if (!answer) return Promise.reject(new Error(`unexpected SDK call ${method}`))
    return Promise.resolve(sourced(answer(args)))
  }) as never)
}
