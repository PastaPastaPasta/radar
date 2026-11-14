import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAllSourceHealth, useDecentralizedOnly } from '@/data/health'
import { PageFrame, useNetwork } from '@/features/entity'
import { LiveDot, openDiagnosticsDrawer } from '@/ui'
import { NoSourceSection } from '@/ui/section-source'
import { BudgetCard } from './BudgetCard'
import { CoreCard } from './CoreCard'
import { PlatformCard } from './PlatformCard'
import { useProbes } from './probes'
import { SOURCE_ROLE } from './source-detail'
import { laggingSources, overallState, sourceRows } from './source-rows'
import { SourcesCard } from './SourcesCard'
import { statusQueries } from './queries'

export function StatusPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const health = useAllSourceHealth()

  const tip = useQuery(statusQueries.tip(net))
  const chainLock = useQuery(statusQueries.chainLock(net))
  const chain = useQuery(statusQueries.chain(net))
  const platform = useQuery(statusQueries.platform(net))
  const probes = useProbes(net)

  const decentralized = useDecentralizedOnly()
  const rows = sourceRows(net, health, decentralized)
  const overall = overallState(rows)

  const behind = laggingSources(rows)
    .map((source) => SOURCE_ROLE[source]().name)
    .join(', ')

  const claim = {
    ok: decentralized ? t`DAPI and the Platform SDK are answering` : t`Every source is answering`,
    attention: t`Some sources are slow or behind`,
    down: t`Some sources aren’t answering`,
    checking: undefined,
  }[overall]

  return (
    <PageFrame
      path="/status"
      title={t`Status`}
      claim={claim}
      eyebrow={t`Core`}
      lede={
        <span role="status" data-overall={overall} className="flex items-center gap-2">
          {overall === 'ok' ? <LiveDot state="ok" bare /> : null}
          {claim ? <span className="sr-only">{claim}. </span> : null}
          {overall === 'ok' && decentralized
            ? t`Hosted sources are off in Decentralized only mode.`
            : null}
          {overall === 'ok' && !decentralized ? t`Nothing is slow, behind or down.` : null}
          {behind ? t`Behind the chain: ${behind}.` : null}{' '}
          {overall === 'attention' || overall === 'down' ? t`The rest still work.` : null}
          {overall === 'checking' ? t`Checking the sources…` : null}
        </span>
      }
    >
      {/* The sources are the page's subject: each card names its own beside its heading, and none joins a page line. */}
      <NoSourceSection>
        <p>
          <Link to="/internals" className="rx-go whitespace-normal">
            {t`Network internals: peers, mempool pressure, versions and history`}
          </Link>
        </p>

        <p>
          <button
            type="button"
            className="dh-btn dh-btn--link text-start"
            data-open-diagnostics
            onClick={openDiagnosticsDrawer}
          >
            {t`Diagnostics: the requests this tab made and how each one went`}
          </button>
        </p>

        <CoreCard tip={tip} chainLock={chainLock} chain={chain} />
        <PlatformCard status={platform} coreTip={tip} />
        <SourcesCard rows={rows} probes={probes} />
        <BudgetCard health={rows.find((r) => r.source === 'dapi')?.health} />
      </NoSourceSection>
    </PageFrame>
  )
}
