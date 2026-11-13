import { useLingui } from '@lingui/react/macro'
import { PageFrame } from '@/features/entity'
import { HyphenGate, StaleIndexNotice } from '../hy-shared/HyphenGate'
import { NetworkInternals } from './NetworkInternals'

export function InternalsPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/internals"
      title={t`Network internals`}
      lede={t`The chain’s size, its node versions and the peers Hyphen reads from.`}
    >
      <HyphenGate unavailable={t`Network internals need an indexer`}>
        <StaleIndexNotice />
        <NetworkInternals />
      </HyphenGate>
    </PageFrame>
  )
}
