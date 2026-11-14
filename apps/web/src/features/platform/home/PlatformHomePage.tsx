import { useLingui } from '@lingui/react/macro'
import type { ReactNode, RefObject } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { PageFrame, useNetwork } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Empty, Unavailable, useAfterIdle } from '@/ui'
import type { HomeRange } from './chart-options'
import { PlatformCharts } from './Charts'
import { ContractsCard, PollsCard, QuorumsCard } from './ChainFacts'
import { RecentEpochs } from './Epochs'
import { Leaderboards } from './Leaderboards'
import { NewestBlocks, NewestTransitions } from './Newest'
import { Proposers } from './Proposers'
import { Pulse } from './Pulse'
import { QuickEntry } from './QuickEntry'
import { useInView } from './use-in-view'
import { Validators } from './Validators'
import { Vitals } from './Vitals'

export interface PlatformHomePageProps {
  range?: HomeRange
  rich?: 'balance' | 'txs'
}

function Zone({
  id,
  title,
  description,
  zoneRef,
  children,
}: {
  id: string
  title: string
  description?: string
  zoneRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <section id={id} ref={zoneRef} className="rx-sec" aria-labelledby={`${id}-title`}>
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id={`${id}-title`}>
          {title}
        </h2>
        {description ? <p className="rx-sec__desc">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4">{children}</div>
    </section>
  )
}

export function PlatformHomePage({ range = '24h', rich = 'balance' }: PlatformHomePageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const indexed = !off && !devnet
  const idle = useAfterIdle()
  const [chainRef, chainSeen] = useInView<HTMLElement>(2_000)
  const [historyRef, historySeen] = useInView<HTMLElement>(4_000)
  const chain = idle && chainSeen

  const notice = off ? (
    <Unavailable
      source="pe"
      title={t`Live activity, charts and leaderboards need Platform Explorer's index`}
    />
  ) : (
    <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
  )

  return (
    <PageFrame
      path="/platform"
      title={t`Platform`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`How Dash Platform is doing: its height, epoch and credits, who is proposing blocks, and what is happening on it.`}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Vitals />
        <QuickEntry />
      </div>

      <Zone
        id="activity"
        title={t`Live activity`}
        description={
          indexed
            ? t`Updates every few seconds. A list holds still while you point at it.`
            : undefined
        }
      >
        {indexed ? (
          <>
            <Pulse />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <NewestBlocks />
              <NewestTransitions />
            </div>
          </>
        ) : (
          notice
        )}
      </Zone>

      <Zone id="chain" title={t`On the chain`} zoneRef={chainRef}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Proposers active={chain} />
          <div className="grid grid-cols-1 content-start gap-4">
            <QuorumsCard active={chain} />
            <PollsCard active={chain} />
          </div>
        </div>
        <RecentEpochs active={chain} />
        <ContractsCard active={chain} />
      </Zone>

      {indexed ? (
        <Zone id="history" title={t`History and leaders`} zoneRef={historyRef}>
          <PlatformCharts range={range} active={historySeen} />
          <Leaderboards rich={rich} active={historySeen} />
          <Validators active={historySeen} />
        </Zone>
      ) : null}
    </PageFrame>
  )
}
