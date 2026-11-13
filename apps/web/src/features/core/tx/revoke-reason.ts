import { msg } from '@lingui/core/macro'

/** The reason codes of a ProUpRevTx, named as Dash Core defines them (`src/evo/providertx.h`). */
export const REVOKE_REASONS = [
  msg`Not specified`,
  msg`Termination of service`,
  msg`Compromised keys`,
  msg`Change of keys`,
] as const
