import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { radarQueries } from '@/data/radar/queries'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { CoreTipCard } from './CoreTipCard'
import { PageFrame, PageLink, useNetwork } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Empty, ErrorState, Skeleton, Unavailable, useNow } from '@/ui'
import { ActivationNotes, HowItWorks } from './HowItWorks'
import { MinersSection } from './MinersSection'
import { SignalSection } from './SignalSection'
import { StatusSection } from './StatusSection'
import { ThresholdsSection } from './ThresholdsSection'
import { STALE_AFTER_MS, v24Of } from './v24-math'
import { useDecentralizedOnly } from '@/data/health'
import { Notice } from '../nodes/parts'

export function V24Page() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/v24"
      title={t`Core 24 activation`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`Where Dash Core 24's activation stands: the masternode signal, miners' signalling window by window, the lock-in threshold and when the next window opens.`}
    >
      <Tracker />
    </PageFrame>
  )
}

function Tracker() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const doc = useQuery({ ...radarQueries.activation(net), enabled: !off && !isDevnet(net) })

  if (off) {
    return (
      <>
        <Unavailable title={t`The activation tracker needs Radar's crawl`} source="radar" />
        <CoreTipCard net={net} />
      </>
    )
  }
  if (isDevnet(net)) {
    return (
      <>
        <Empty
          kind="unsupported-network"
          title={t`Radar doesn't crawl devnets.`}
          body={t`The activation tracker reads Radar's view of mainnet and testnet.`}
        />
        <CoreTipCard net={net} />
      </>
    )
  }
  if (doc.isPending) return <Skeleton shape="block" height={240} />
  if (!doc.data) {
    return <ErrorState error={doc.error} source="radar" onRetry={() => void doc.refetch()} />
  }
  const d = v24Of(doc.data.data)
  if (!d) {
    return (
      <Empty
        kind="none-yet"
        title={t`No Core 24 deployment in the data.`}
        body={t`Radar's activation document doesn't list it.`}
      />
    )
  }
  return <Readings doc={doc.data.data} d={d} stamp={stampOf(doc.data)} />
}

function Readings({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const now = useNow()
  const stale = now - doc.updated > STALE_AFTER_MS
  const failed =
    doc.error === null ? undefined : typeof doc.error === 'string' ? doc.error : doc.error.message
  return (
    <>
      {failed || stale ? (
        <Notice tone="warn" data-stale-notice>
          {failed ? (
            <>
              <b>{t`The latest reading failed.`}</b>{' '}
              {t`Showing the one from block ${String(doc.tip.height)}: ${failed}`}
            </>
          ) : (
            <>
              <b>{t`This reading is stale.`}</b>{' '}
              {t`It's from block ${String(doc.tip.height)}; our dashd or the crawler host may be down.`}
            </>
          )}
        </Notice>
      ) : null}
      <ActivationNotes d={d} />
      <StatusSection doc={doc} d={d} stamp={stamp} />
      <SignalSection d={d} stamp={stamp} />
      <MinersSection doc={doc} d={d} stamp={stamp} />
      <ThresholdsSection doc={doc} d={d} stamp={stamp} />
      <HowItWorks doc={doc} d={d} stamp={stamp} />
      <p className="text-sm text-[var(--dh-ink-2)]">
        <PageLink to="/nodes" hash="readiness">
          {t`The share of all masternodes on Core 24 is on the node census.`}
        </PageLink>
      </p>
    </>
  )
}
