import { useLingui } from '@lingui/react/macro'
import { useDecentralizedOnly } from '@/data/health'
import { PageFrame, useNetwork } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Empty, Section, Unavailable, useAfterIdle } from '@/ui'
import type { HomeRange } from './chart-options'
import { PlatformCharts } from './Charts'
import { ContractsCard, PollsCard, QuorumsCard } from './ChainFacts'
import { EpochNow, useEpochClaim } from './EpochNow'
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

export function PlatformHomePage({ range = '24h', rich = 'balance' }: PlatformHomePageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const indexed = !off && !devnet
  const idle = useAfterIdle()
  const [chainRef, chainSeen] = useInView<HTMLDivElement>(2_000)
  const [historyRef, historySeen] = useInView<HTMLDivElement>(4_000)
  const chain = idle && chainSeen
  const claim = useEpochClaim()

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
      claim={claim}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`How Dash Platform is doing: its height, epoch and credits, who is proposing blocks, and what is happening on it.`}
    >
      <EpochNow />

      <div className="rx-cols rx-cols--lead">
        <Vitals />
        <QuickEntry />
      </div>

      <Section id="chain" layer="platform" title={t`On the chain`}>
        <div className="rx-pile" ref={chainRef}>
          <div className="rx-cols">
            <Proposers active={chain} />
            <div className="rx-pile">
              <QuorumsCard active={chain} />
              <PollsCard active={chain} />
            </div>
          </div>
          <RecentEpochs active={chain} />
          <ContractsCard active={chain} />
        </div>
      </Section>

      <Section
        id="activity"
        layer="platform"
        title={t`Live activity`}
        lede={
          indexed
            ? t`Updates every few seconds. A list holds still while you point at it.`
            : undefined
        }
      >
        {indexed ? (
          <div className="rx-pile">
            <Pulse />
            <div className="rx-cols">
              <NewestBlocks />
              <NewestTransitions />
            </div>
          </div>
        ) : (
          notice
        )}
      </Section>

      {indexed ? (
        <Section id="history" layer="platform" title={t`History and leaders`}>
          <div className="rx-pile" ref={historyRef}>
            <PlatformCharts range={range} active={historySeen} />
            <Leaderboards rich={rich} active={historySeen} />
            <Validators active={historySeen} />
          </div>
        </Section>
      ) : null}
    </PageFrame>
  )
}
