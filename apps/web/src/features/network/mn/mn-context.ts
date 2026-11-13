import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import type { NetworkId } from '@/lib/network'
import type { DapiFacts } from './mn-info'

/** What every tab knows about the masternode being shown. */
export interface MnContext {
  net: NetworkId
  protx: string
  /** Radar's record, null when Radar has none or the mode keeps it off. */
  d: RadarMasternodeDetail | null
  radar: SourceStamp | null
  /** DAPI's list entry, null when the list has none or has not answered. */
  f: DapiFacts | null
  dapi: SourceStamp | null
  evo: boolean
  /** Decentralized only mode is on. */
  off: boolean
}
