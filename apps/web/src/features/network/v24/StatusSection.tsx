import { useLingui } from '@lingui/react/macro'
import { formatInt } from '@/lib/format'
import type { SourceStamp } from '@/data/envelope'
import type {
  RadarActivation,
  RadarActivationDeployment,
  ActivationBlock,
} from '@/data/radar/schemas'
import { Badge, Card } from '@/ui'
import { Figure, FigureGrid } from '../nodes/parts'
import { when, share } from './v24-format'
import { blockMs, milestones, type V24State } from './v24-math'

const STATE_TONE: Record<V24State, 'neutral' | 'warning' | 'success' | 'danger'> = {
  defined: 'neutral',
  started: 'warning',
  locked_in: 'success',
  active: 'success',
  failed: 'danger',
}

export function StatusSection({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const o = d.outlook
  const p = d.params
  const w = d.window
  const known = (['defined', 'started', 'locked_in', 'active', 'failed'] as const).find(
    (s) => s === d.state,
  )
  const stateLabel = {
    defined: t`Not started`,
    started: t`Signalling`,
    locked_in: t`Locked in`,
    active: t({ message: 'Active', context: 'upgrade state' }),
    failed: t`Failed`,
  }
  const block = (b: ActivationBlock | null | undefined): string =>
    b ? t`block ${formatInt(b.height)}` : ''
  const at = (b: ActivationBlock | null | undefined, approx = true): string =>
    b?.time == null ? '' : `${approx && b.estimated ? t`about` + ' ' : ''}${when(blockMs(b))}`
  const blockWithTime = (b: ActivationBlock): string =>
    b.time == null
      ? block(b)
      : t`${block(b)}, ${b.estimated ? t`about` + ' ' : ''}${when(blockMs(b))}`

  const headline = (): string => {
    switch (o.phase) {
      case 'waiting_for_signal':
        return o.start_time_reached
          ? t`The start time has passed; Core 24 is waiting for the masternodes' signal to be mined.`
          : t`Core 24 can't start before ${when(p.start_time)} (the chain's median time). Then masternodes signal it, and miners vote window by window.`
      case 'waiting_for_window':
        return t`The masternodes' signal is in block ${formatInt(d.ehf.height ?? 0)}; miners start signalling at block ${formatInt(o.earliest_start?.height ?? 0)}.`
      case 'signalling':
        return t`Miners are signalling: ${formatInt(w?.count ?? 0)} of the ${formatInt(w?.threshold ?? 0)} blocks this window needs, with ${formatInt(o.remaining ?? 0)} blocks to go.`
      case 'locked_in':
        return t`Core 24 is locked in. It activates at ${o.activation ? blockWithTime(o.activation) : ''}.`
      case 'active':
        return t`Core 24 is active since ${o.activation ? blockWithTime(o.activation) : ''}.`
      case 'failed':
        return t`Core 24 failed: it reached its timeout without locking in.`
      case 'timed_out':
        return t`Core 24's timeout passed before the masternodes' signal was mined, so it can't start any more.`
      default:
        return ''
    }
  }

  const threshold =
    w?.threshold ?? (o.phase === 'signalling' ? null : o.first_threshold) ?? p.threshold_start
  const items = [
    <Figure
      key="status"
      label={t`Status`}
      value={known ? <Badge tone={STATE_TONE[known]}>{stateLabel[known]}</Badge> : d.state}
      note={d.since ? t`since block ${formatInt(d.since)}` : t`start time ${when(p.start_time)}`}
    />,
    d.state === 'defined' || d.state === 'started' ? (
      <Figure
        key="threshold"
        label={t`Lock-in threshold`}
        value={threshold == null ? '–' : share(threshold, p.window)}
        note={
          w?.attempt != null && threshold != null
            ? t`${formatInt(threshold)} of ${formatInt(p.window)} blocks, on attempt ${String(w.attempt + 1)}`
            : t`${formatInt(threshold ?? 0)} of ${formatInt(p.window)} blocks in the first window, falling to ${share(p.threshold_min, p.window)}`
        }
      />
    ) : null,
    o.phase === 'signalling' && w ? (
      <Figure
        key="window"
        label={t`This window`}
        value={`${formatInt(w.count)} / ${formatInt(w.threshold ?? 0)}`}
        tone={!o.needed ? 'good' : o.possible ? undefined : 'warn'}
        note={
          !o.needed
            ? t`threshold reached`
            : o.possible
              ? t`${formatInt(o.needed)} more needed in ${formatInt(o.remaining ?? 0)} blocks`
              : t`can't reach it any more`
        }
      />
    ) : o.earliest_start ? (
      <Figure
        key="window"
        label={t`Next window that counts`}
        value={block(o.earliest_start)}
        note={`${at(o.earliest_start)}${o.phase === 'waiting_for_signal' ? `, ${t`at the earliest`}` : ''}`}
      />
    ) : null,
    o.earliest_activation ? (
      <Figure
        key="earliest"
        label={t`Earliest activation`}
        value={block(o.earliest_activation)}
        note={t`about ${when(blockMs(o.earliest_activation))}`}
      />
    ) : null,
    o.activation_if_reached ? (
      <Figure
        key="if-reached"
        label={t`Activation if this window locks in`}
        value={block(o.activation_if_reached)}
        note={t`about ${when(blockMs(o.activation_if_reached))}`}
      />
    ) : null,
    o.activation && o.phase !== 'active' ? (
      <Figure
        key="activation"
        label={t`Activation`}
        value={block(o.activation)}
        note={t`about ${when(blockMs(o.activation))}`}
      />
    ) : null,
    <Figure
      key="signal"
      label={t`Masternode signal`}
      value={d.ehf.height ? t`block ${formatInt(d.ehf.height)}` : t`not mined yet`}
      tone={d.ehf.height ? 'good' : undefined}
      note={d.ehf.height ? when(blockMs(d.ehf.block)) : t`needed before any window counts`}
    />,
  ].filter((x) => x !== null)

  const labels: Record<string, string> = {
    'start-time': t`Median time reaches the start time`,
    signal: t`Masternodes' signal mined`,
    'first-window': d.ehf.height
      ? t`First window that can count opens`
      : t`First window that can count opens, at the earliest`,
    'lock-in':
      o.phase === 'signalling'
        ? t`Lock-in, if it reaches the threshold`
        : t`Lock-in, if that window reaches the threshold`,
    activation:
      o.phase === 'signalling'
        ? t`Activation, if this window locks in`
        : o.phase === 'locked_in'
          ? t`Activation`
          : t`Activation, at the earliest`,
    'window-end': t`This window ends (attempt ${String((w?.attempt ?? 0) + 1)})`,
    'locked-in': t`Locked in`,
    active: t({ message: 'Active', context: 'upgrade state' }),
  }
  const road = milestones(d, o)

  return (
    <Card
      title={t`Where it stands`}
      id="status"
      layer="network"
      subtitle={headline()}
      source={stamp}
    >
      <div className="grid gap-5" data-v24-status>
        <FigureGrid columns={4}>{items}</FigureGrid>
        {road.length > 0 ? (
          <ol className="grid gap-1.5" aria-label={t`What happens next`} data-milestones>
            {road.map((m) => (
              <li
                key={m.id}
                data-milestone={m.id}
                data-done={m.done || undefined}
                className="flex flex-wrap justify-between gap-x-4 text-sm"
              >
                <span className={m.done ? 'text-[var(--dh-ink-2)] line-through' : undefined}>
                  {labels[m.id] ?? m.id}
                </span>
                <span className="tabular-nums text-[var(--dh-ink-2)]">
                  {m.block
                    ? `${block(m.block)}${m.block.time != null ? `, ${at(m.block, false)}` : ''}${m.block.estimated ? ` (${t`estimate`})` : ''}`
                    : '–'}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="text-sm text-[var(--dh-ink-2)]">
          {t`Read from our dashd (${doc.dashd || t`unknown version`}) at block ${formatInt(doc.tip.height)}, ${when(doc.updated)}. Times to come are estimates at the last ${formatInt(doc.pace_blocks)} blocks' pace, ${String(Math.round(doc.block_seconds))} s a block; a slower or faster chain moves them, and the masternode signal can come later than its earliest block.`}
        </p>
      </div>
    </Card>
  )
}
