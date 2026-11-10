import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAllSourceHealth } from '@/data/health'
import { getCoreClient, useDocumentTitle, useNetwork } from '@/features/entity'
import { LiveDot } from '@/ui'
import { BudgetCard } from './BudgetCard'
import { CoreCard } from './CoreCard'
import { useProbes } from './probes'
import { overallState, sourceRows } from './source-rows'
import { SourcesCard } from './SourcesCard'
import { statusQueries } from './queries'

export function StatusPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const core = getCoreClient()
  const health = useAllSourceHealth()
  useDocumentTitle(t`Status`)

  const q = useMemo(() => statusQueries(core), [core])
  const tip = useQuery(q.tip(net))
  const chainLock = useQuery(q.chainLock(net))
  const chain = useQuery(q.chain(net))
  const probes = useProbes(net)

  const rows = sourceRows(net, health)
  const overall = overallState(rows)

  return (
    <article data-page="/status" data-layer="core" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`Core`}
        </p>
        <h1 className="text-3xl font-semibold">{t`Status`}</h1>
        <p role="status" data-overall={overall} className="flex items-center gap-2">
          {overall === 'ok' ? <LiveDot state="ok" bare /> : null}
          {overall === 'ok' ? t`Every source is answering.` : null}
          {overall === 'attention'
            ? t`Some sources are slow or behind. The rest still work.`
            : null}
          {overall === 'down' ? t`Some sources aren’t answering. The rest still work.` : null}
          {overall === 'checking' ? t`Checking the sources…` : null}
        </p>
      </header>

      <CoreCard tip={tip} chainLock={chainLock} chain={chain} />
      <SourcesCard rows={rows} probes={probes} />
      <BudgetCard health={rows.find((r) => r.source === 'dapi')?.health} />
    </article>
  )
}
