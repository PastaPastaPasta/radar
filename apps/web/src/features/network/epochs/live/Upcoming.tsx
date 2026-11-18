import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { Entity } from '@/features/entity'
import { clampSkew, formatInt, formatIsoUtc, formatRelative } from '@/lib/format'
import { announce, Card, DataTable, LiveDot, Time, useReducedMotion } from '@/ui'
import type { LiveKind } from './connection'
import { etaOf, movedOn, type ScheduleRow, type ScheduleState } from './schedule'
import type { LiveSchedule } from './useLiveSchedule'
import './live-schedule.css'

const MINUTE = 60_000
const LEAVE_MS = 260
const RISE_MS = 300
const NO_IDS: ReadonlySet<string> = new Set()

type Phase = 'leave' | 'rise' | 'settled'

interface Motion {
  rev: number
  rows: ScheduleRow[]
  before: ScheduleRow[]
  gone: string[]
  fresh: ReadonlySet<string>
  phase: Phase
}

/**
 * The rows as drawn while a block moves the list on: the passed proposers fade out where they were, then the rest rise
 * into their places and the new ones slide in at the bottom. Under reduced motion the list updates in place.
 */
function useRowMotion(rows: ScheduleRow[], rev: number, passed: string[], reduced: boolean) {
  const [m, setM] = useState<Motion>({
    rev,
    rows,
    before: rows,
    gone: [],
    fresh: NO_IDS,
    phase: 'settled',
  })
  if (m.rev !== rev) {
    const was = new Set(m.rows.map((r) => r.protx))
    const gone = passed.filter((id) => was.has(id))
    const fresh = new Set(rows.filter((r) => !was.has(r.protx)).map((r) => r.protx))
    setM({
      rev,
      rows,
      before: m.rows,
      gone,
      fresh,
      phase: reduced || gone.length === 0 ? 'settled' : 'leave',
    })
  } else if (m.rows !== rows) {
    setM({ ...m, rows })
  }
  const { phase } = m
  useEffect(() => {
    if (phase === 'settled') return
    const id = window.setTimeout(
      () =>
        setM((cur) =>
          cur.rev === rev ? { ...cur, phase: phase === 'leave' ? 'rise' : 'settled' } : cur,
        ),
      phase === 'leave' ? LEAVE_MS : RISE_MS,
    )
    return () => window.clearTimeout(id)
  }, [phase, rev])
  if (phase === 'leave') return { rows: m.before, leaving: new Set(m.gone), rise: 0, fresh: NO_IDS }
  return {
    rows: m.rows,
    leaving: NO_IDS,
    rise: phase === 'rise' ? m.gone.length : 0,
    fresh: m.fresh,
  }
}

/** "1 min 21 s", "8 s": a countdown keeps its seconds. */
function useCountdownText() {
  const { t } = useLingui()
  return (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return m > 0 ? t`${m} min ${s} s` : t`${s} s`
  }
}

const DOT: Record<LiveKind, 'ok' | 'down' | 'stale' | 'unknown'> = {
  live: 'ok',
  paused: 'down',
  quiet: 'stale',
  connecting: 'unknown',
}

function LiveStrip({ live }: { live: LiveSchedule }) {
  const { t } = useLingui()
  const countdown = useCountdownText()
  const { kind, now, state, blockMs, retry } = live
  const tip = state.tip
  const ago = tip ? countdown(now - tip.timeMs) : undefined
  const next = tip ? tip.timeMs + blockMs - now : undefined
  const pace = countdown(blockMs)
  let status: string
  if (kind === 'connecting') status = t`Connecting to Platform…`
  else if (kind === 'paused')
    status = ago
      ? t`Updates paused, last block ${ago} ago`
      : t`Updates paused: Platform isn’t answering`
  else if (kind === 'quiet')
    status = t`No new block for ${ago}, where one usually comes about every ${pace}`
  else status = t`Live`
  return (
    <div
      className="rx-livesched"
      data-live={kind}
      role="group"
      aria-label={t`Latest Platform block`}
    >
      <span className="rx-livesched__state">
        <LiveDot key={state.rev} state={DOT[kind]} bare />
        <span>{status}</span>
        {kind === 'paused' || kind === 'quiet' ? (
          <button type="button" className="dh-btn dh-btn--sm" onClick={retry}>
            {t`Try again`}
          </button>
        ) : null}
      </span>
      {tip ? (
        <span className="rx-livesched__tip" data-tip-height={tip.height}>
          <span>{t`Latest block`}</span>{' '}
          <Entity kind="platform-block" id={String(tip.height)} copy={false} />
          {tip.proposer ? (
            <>
              {' · '}
              <span>{t`proposed by`}</span> <Entity kind="evonode" id={tip.proposer} copy={false} />
            </>
          ) : null}
          {' · '}
          <time
            className="rx-time"
            dateTime={formatIsoUtc(tip.timeMs)}
            title={formatIsoUtc(tip.timeMs)}
          >
            {formatRelative(clampSkew(tip.timeMs, now), now)}
          </time>
        </span>
      ) : null}
      {kind === 'live' && next !== undefined ? (
        <span className="rx-livesched__next" data-next-in={Math.max(0, Math.round(next / 1000))}>
          {next > 0
            ? t`Next block expected in about ${countdown(next)}`
            : t`Next block due now (about every ${pace})`}
        </span>
      ) : null}
    </div>
  )
}

function Eta({ ms, now }: { ms: number; now: number }) {
  const { t } = useLingui()
  return ms - now < MINUTE ? <>{t`any moment`}</> : <Time ms={ms} mode="both" live />
}

function OrderNote({ state }: { state: ScheduleState }) {
  const { t } = useLingui()
  const seed = state.seed
  if (!seed) return <>{t`The next twelve proposers, each with the blocks until its turn.`}</>
  const at = formatInt(seed.height)
  const moved = movedOn(state)
  const since =
    moved > 0
      ? ` ${plural(moved, {
          one: 'Moved on # block since, assuming no missed turn.',
          other: 'Moved on # blocks since, assuming no missed turn.',
        })}`
      : ''
  return seed.origin === 'dapi' ? (
    <>
      {t`Tenderdash’s turn order, from the validator sets an evonode reported at block ${at}. Not proof-checked: a missed turn or a new set shifts it.`}
      {since}
    </>
  ) : (
    <>
      {t`From Radar’s last look at the validator sets, at block ${at}, while DAPI doesn’t answer. A missed turn or a new set shifts it.`}
      {since}
    </>
  )
}

/** RA-62: the next proposers, moved on as each Platform block lands. */
export function Upcoming({
  live,
  crawlState,
}: {
  live: LiveSchedule
  crawlState: 'off' | 'loading' | 'ready' | 'error'
}) {
  const { t } = useLingui()
  const reduced = useReducedMotion()
  const { state, now, blockMs } = live
  const motion = useRowMotion(live.rows, state.rev, state.passed, reduced)
  const from = state.tip?.timeMs ?? state.seed?.timeMs ?? now
  const height = state.tip?.height
  useEffect(() => {
    if (state.rev > 0 && height !== undefined)
      announce(t`New Platform block ${formatInt(height)}`, {
        key: 'platform-block',
        throttleMs: 10_000,
      })
  }, [state.rev, height, t])
  const columns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        id: 'node',
        header: t`Evonode`,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.protx} />,
        meta: { phone: 'title' },
      },
      {
        id: 'slots',
        header: t`Blocks away`,
        accessorFn: (r) => `+${formatInt(r.away)}`,
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'eta',
        header: t`Proposes around`,
        cell: ({ row }) => <Eta ms={etaOf(row.original, from, blockMs, now)} now={now} />,
        meta: { phone: 'primary' },
      },
    ],
    [t, from, blockMs, now],
  )
  const stamps: SourceStamp[] = []
  if (state.seed) stamps.push(state.seed.stamp)
  if (live.epoch) stamps.push(stampOf(live.epoch))
  const setsFailed = live.setsError !== undefined
  const waiting = !state.seed && (!setsFailed || crawlState === 'loading')
  const failed = !state.seed && setsFailed && crawlState !== 'loading' && crawlState !== 'ready'
  return (
    <Card
      id="upcoming"
      layer="network"
      title={t`Who proposes next`}
      subtitle={<OrderNote state={state} />}
      source={stamps}
    >
      <LiveStrip live={live} />
      <DataTable
        caption={t`The next proposers`}
        columns={columns}
        rows={motion.rows}
        getRowId={(r) => r.protx}
        live={{
          newRowIds: motion.fresh as Set<string>,
          leavingRowIds: motion.leaving as Set<string>,
          rise: motion.rise,
        }}
        state={failed ? 'error' : waiting ? 'loading' : 'ready'}
        error={failed ? live.setsError : undefined}
        onRetry={live.retry}
        empty={
          state.seed
            ? t`The last proposer order has run out. A fresh one is on its way.`
            : t`No proposer order yet.`
        }
      />
    </Card>
  )
}
