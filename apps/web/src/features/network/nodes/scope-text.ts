import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { CensusScope } from './census-math'

/**
 * What the sections call what they count. Masternodes and evonodes are counted once each; the whole network and the
 * other full nodes are counted by address, since a node reachable on two networks answers at both.
 */
export const SCOPE_NOUN: Record<CensusScope, MessageDescriptor> = {
  all: msg`reachable addresses`,
  mn: msg`masternodes`,
  evo: msg`evonodes`,
  other: msg`other full nodes’ addresses`,
}

export const SCOPE_LABEL: Record<CensusScope, MessageDescriptor> = {
  all: msg`All nodes`,
  mn: msg`Masternodes`,
  evo: msg`Evonodes`,
  other: msg`Other full nodes`,
}
