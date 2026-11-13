import { useLingui } from '@lingui/react/macro'
import { useSearch } from '@tanstack/react-router'
import { PageFrame } from '@/features/entity'
import { CurrentEpoch } from './CurrentEpoch'
import { Proposers } from './Proposers'
import { RadarZone } from './RadarZone'
import { RangeTable } from './RangeTable'

export function EpochsPage() {
  const { t } = useLingui()
  const { from, to } = useSearch({ from: '/epochs' })
  return (
    <PageFrame
      path="/epochs"
      title={t`Epochs`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`Where the current Platform epoch stands, who proposes blocks in it, and the epochs before it.`}
    >
      <CurrentEpoch />
      <RadarZone />
      <Proposers />
      <RangeTable from={from} to={to} />
    </PageFrame>
  )
}
