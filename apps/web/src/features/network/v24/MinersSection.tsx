import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, Chart } from '@/ui'
import { useCensusColors } from '../nodes/census-colors'
import { windowOption, windowsOption, type WindowChartColors } from './v24-charts'
import { windowProgress, windowSlots } from './v24-math'

function useChartColors(): WindowChartColors {
  const c = useCensusColors()
  return {
    signalled: c.rank[0]!,
    threshold: c.ink,
    projection: c.ink2,
    met: c.good,
  }
}

/** Miners' signalling: the current window block by block, and window by window. */
export function MinersSection({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const colors = useChartColors()
  const p = d.params
  const w = d.window
  const started =
    ['started', 'locked_in', 'active', 'failed'].includes(d.state) ||
    (d.windows ?? []).some((x) => x.state === 'started')
  const lede = started
    ? t`Each ${formatInt(p.window)}-block window, blocks that set bit ${String(p.bit)} (with the top version bits 001) count as signalling. A window with as many as its threshold locks Core 24 in. In the last ${formatInt(d.recent.blocks)} blocks, ${formatInt(d.recent.count)} signalled.`
    : t`Miners can't vote yet. From the first window that counts, each ${formatInt(p.window)}-block window's blocks that set bit ${String(p.bit)} (with the top version bits 001) count; ${formatInt(p.threshold_start)} of them (${formatPercent(p.threshold_start / p.window, 1)}) lock Core 24 in, and each window that falls short lowers the bar for the next, down to ${formatInt(p.threshold_min)}. In the last ${formatInt(d.recent.blocks)} blocks, ${formatInt(d.recent.count)} already set bit ${String(p.bit)}.`

  const progress =
    d.state === 'started' && w?.threshold != null ? windowProgress(w, p.window) : undefined
  const slots = windowSlots(d, doc.block_seconds)
  const names = {
    signalled: t`Signalling blocks so far`,
    threshold: t`Threshold`,
    projection: t`At this pace`,
  }

  return (
    <Card title={t`Miners' signalling`} id="miners" layer="network" subtitle={lede} source={stamp}>
      <div className="grid gap-8" data-v24-miners>
        {progress && w ? (
          <div className="grid gap-2" data-v24-window>
            <h4 className="font-semibold">
              {t`This window (attempt ${String((w.attempt ?? 0) + 1)}), block by block`}
              <span className="ml-2 text-sm font-normal text-[var(--dh-ink-2)]">
                {t`blocks ${formatInt(w.start.height)}–${formatInt(w.end.height)}`}
              </span>
            </h4>
            <Chart
              option={windowOption(progress, p.window, w.threshold ?? 0, names, colors)}
              height={220}
              label={t`${formatInt(w.count)} of ${formatInt(progress.mined)} blocks so far signalled; the window needs ${formatInt(w.threshold ?? 0)} of ${formatInt(p.window)}; at this pace it ends with about ${formatInt(progress.projected)}`}
              table={{
                columns: [t`Block in the window`, t`Signalling blocks so far`],
                rows: Array.from({ length: Math.ceil(progress.mined / 100) + 1 }, (_, i) =>
                  Math.min(i * 100, progress.mined),
                )
                  .filter((n, i, all) => all.indexOf(n) === i)
                  .map((n) => [formatInt(n), formatInt(progress.cumulative[n] ?? 0)]),
              }}
            />
            <p className="text-sm text-[var(--dh-ink-2)]">
              {t`Threshold ${formatInt(w.threshold ?? 0)}; at this pace the window ends with ${formatInt(progress.projected)}.`}
            </p>
          </div>
        ) : null}
        <div className="grid gap-2" data-v24-windows>
          <h4 className="font-semibold">{t`Signalling and threshold, window by window`}</h4>
          {slots.length === 0 ? (
            <p className="text-sm text-[var(--dh-ink-2)]">{t`No window to show yet.`}</p>
          ) : (
            <Chart
              option={windowsOption(
                slots.map((s) => ({
                  label: `#${String(s.attempt + 1)}`,
                  share: s.count === null ? undefined : s.count / p.window,
                  threshold: s.threshold / p.window,
                  met: s.count !== null && s.count >= s.threshold,
                })),
                { signalled: t`Signalled`, threshold: t`Threshold` },
                colors,
              )}
              height={220}
              label={t`Signalling share and threshold for ${String(slots.length)} windows`}
              table={{
                columns: [t`Window`, t`From block`, t`Signalled / threshold`],
                rows: slots.map((s) => [
                  `#${String(s.attempt + 1)}${s.future ? ` (${t`estimate`})` : ''}`,
                  formatInt(s.height),
                  `${s.count === null ? '–' : formatInt(s.count)} / ${formatInt(s.threshold)}`,
                ]),
              }}
            />
          )}
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`Share of each window's blocks, the threshold marked. Windows to come are dated by estimate.`}
          </p>
        </div>
      </div>
    </Card>
  )
}
