import { plural, t } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { formatInt } from '@/lib/format'
import { Time } from '@/ui'

/**
 * The Core pages' headlines: what each page has to say right now. They live here because this file has its own
 * message catalog (`core`); the rest of `features/core` is in the base catalog.
 */

/** The header already carries the height on every page, so the list opens with how fresh the chain is. */
export function BlocksClaim({ minedAt }: { minedAt: number }) {
  return (
    <Trans>
      The latest block was mined <Time ms={minedAt} mode="relative" live />
    </Trans>
  )
}

export const mempoolClaim = (count: number): string =>
  count === 0
    ? t`No transactions are waiting for a block`
    : plural(count, {
        one: '# transaction is waiting for a block',
        other: '# transactions are waiting for a block',
      })

/** `passing` counts the open proposals with the votes to be paid, in the budget already or not. */
export function governanceClaim(open: number, passing: number): string | undefined {
  if (open === 0) return undefined
  const have = formatInt(passing)
  return plural(open, {
    one: `${have} of # open proposal has the votes to be funded`,
    other: `${have} of # open proposals have the votes to be funded`,
  })
}
