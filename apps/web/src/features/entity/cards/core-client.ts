import type { CoreClient } from '@/data/core/types'
import { SourceError } from '@/data/errors'

const unavailable = (): Promise<never> =>
  Promise.reject(
    new SourceError({
      source: 'dapi',
      kind: 'unavailable',
      message: 'The Core client is not connected in this build',
    }),
  )

const NOT_CONNECTED: CoreClient = {
  tip: unavailable,
  chainLock: unavailable,
  status: unavailable,
  block: unavailable,
  tx: unavailable,
  prevouts: unavailable,
  headers: unavailable,
  blockRows: unavailable,
  heightAtTime: unavailable,
  nodeSelfStatus: unavailable,
  masternodeList: unavailable,
}

let current: CoreClient = NOT_CONNECTED

/** The Core façade the status page and the hover cards read through. Tests install a double. */
export function getCoreClient(): CoreClient {
  return current
}

export function setCoreClient(client: CoreClient | undefined): void {
  current = client ?? NOT_CONNECTED
}
