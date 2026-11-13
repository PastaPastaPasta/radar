import { useLingui } from '@lingui/react/macro'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { PageFrame } from '../hy-shared/PageFrame'
import { NetworkInternals } from './NetworkInternals'

export function InternalsPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/internals"
      title={t`Network internals`}
      lede={t`The chain’s size, its node versions and the peers Hyphen reads from.`}
    >
      <HyphenGate>
        <StaleIndexNotice />
        <NetworkInternals />
      </HyphenGate>
    </PageFrame>
  )
}
