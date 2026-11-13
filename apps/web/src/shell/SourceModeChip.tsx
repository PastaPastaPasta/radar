import { useLingui } from '@lingui/react/macro'
import { PageLink } from '@/features/search'
import { Icon } from '@/ui'

export function SourceModeChip({ place }: { place: 'bar' | 'strip' }) {
  const { t } = useLingui()
  return (
    <PageLink
      to="/sources"
      className={place === 'strip' ? 'rx-srcmode rx-srcmode--strip' : 'rx-srcmode'}
      data-source-mode="decentralized"
      data-place={place}
      title={t`Decentralized only: Radar reads only DAPI nodes and the Platform SDK, and asks no hosted service. Open Sources to see what that leaves out or to switch it off.`}
    >
      <Icon name="shield" size="sm" />
      <span className="rx-srcmode__word">{t`Decentralized only`}</span>
    </PageLink>
  )
}
