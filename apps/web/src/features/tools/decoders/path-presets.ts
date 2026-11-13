import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { base58Decode } from '@/lib/base58'
import { bytesToHex } from '@/lib/hex'
import { knownKeys, type GroveContext } from './grovedb-schema'

export interface PathPreset {
  id: string
  title: MessageDescriptor
  about: MessageDescriptor
  /** The tree to read, one hex segment per level; empty is the root tree. */
  path: string[]
  /** The entries to ask for, hex. */
  keys: string[]
  /** Where the keys live, for naming them in the answer. */
  context: GroveContext
}

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const hexKeys = (context: GroveContext) => knownKeys(context).map((k) => k.hex)

export const PATH_PRESETS: PathPreset[] = [
  {
    id: 'root',
    title: msg`The root tree`,
    about: msg`The well-known subtrees Platform keeps at the top of its state.`,
    path: [],
    keys: hexKeys('root'),
    context: 'root',
  },
  {
    id: 'votes',
    title: msg`Voting state`,
    about: msg`The subtrees of the votes tree: contested resources, decisions, end dates and identity votes.`,
    path: ['70'],
    keys: hexKeys('votes'),
    context: 'votes',
  },
  {
    id: 'dpns-contract',
    title: msg`DPNS contract`,
    about: msg`The two entries inside the DPNS contract's subtree: its definition and its documents.`,
    path: ['40', bytesToHex(base58Decode(DPNS))],
    keys: hexKeys('contract-id'),
    context: 'contract-id',
  },
]

export const presetById = (id: string | undefined): PathPreset | undefined =>
  PATH_PRESETS.find((p) => p.id === id)
