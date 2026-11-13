import { SourceError } from '../errors'
import type { CoreClient } from './types'

/** The deterministic masternode list from DAPI, keyed by ProTx hash. NET-B implements it. */
export const masternodeList: CoreClient['masternodeList'] = () =>
  Promise.reject(
    new SourceError({
      source: 'dapi',
      kind: 'unavailable',
      message: 'The masternode list stream is not wired up yet',
    }),
  )
