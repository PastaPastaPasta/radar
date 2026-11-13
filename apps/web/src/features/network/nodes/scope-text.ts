import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { CensusScope } from './census-math'

/** What the sections call the nodes in view. */
export const SCOPE_NOUN: Record<CensusScope, MessageDescriptor> = {
  all: msg`nodes`,
  mn: msg`masternodes`,
  evo: msg`evonodes`,
  other: msg`other full nodes`,
}

export const SCOPE_LABEL: Record<CensusScope, MessageDescriptor> = {
  all: msg`All nodes`,
  mn: msg`Masternodes`,
  evo: msg`Evonodes`,
  other: msg`Other full nodes`,
}
