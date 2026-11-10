import { useLingui } from '@lingui/react/macro'
import type { SourceHealth } from '@/data/health'
import { formatInt } from '@/lib/format'
import { Card, KeyValue, LiveDot } from '@/ui'

export function BudgetCard({ health }: { health?: SourceHealth }) {
  const { t } = useLingui()
  const budget = health?.budget
  const fallback =
    health?.state === 'down'
      ? t`DAPI isn’t answering, so block and transaction details come from Hyphen and say so.`
      : budget && budget.pressure !== 'ok'
        ? t`DAPI is busy, so block lists come from Hyphen while the budget recovers. Details still use DAPI.`
        : t`Everything Core shows comes from DAPI.`

  return (
    <Card
      id="budget"
      layer="core"
      title={t`DAPI request budget`}
      subtitle={t`Radar keeps each evonode well under its rate limit, so one visitor can’t crowd out another.`}
    >
      {budget ? (
        <KeyValue
          columns={2}
          items={[
            {
              label: t`Pressure`,
              value: (
                <span data-budget-pressure={budget.pressure}>
                  <LiveDot
                    state={
                      budget.pressure === 'ok'
                        ? 'ok'
                        : budget.pressure === 'tight'
                          ? 'degraded'
                          : 'down'
                    }
                    bare
                  />{' '}
                  {budget.pressure === 'ok'
                    ? t`Plenty of room`
                    : budget.pressure === 'tight'
                      ? t`Getting tight`
                      : t`Used up for now`}
                </span>
              ),
            },
            {
              label: t`Requests in the last minute`,
              value: t`${formatInt(budget.usedLastMinute)} of ${formatInt(budget.capacity)}`,
            },
            { label: t`Headroom`, value: formatInt(budget.headroom) },
            { label: t`Nodes resting`, value: formatInt(budget.benched) },
          ]}
        />
      ) : (
        <p className="text-[var(--dh-ink-2)]">{t`No DAPI requests have been made on this network yet.`}</p>
      )}
      <p className="mt-3" data-fallback-note>
        {fallback}
      </p>
    </Card>
  )
}
