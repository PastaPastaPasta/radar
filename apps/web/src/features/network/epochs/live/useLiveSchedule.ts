import { useQuery } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { budget } from '@/data/dapi-core/budget'
import { stampOf, type Sourced } from '@/data/envelope'
import { platformDapiQueries } from '@/data/platform-dapi/queries'
import type { RadarPlatform } from '@/data/radar/schemas'
import type { EpochDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'
import { useAfterIdle } from '@/ui'
import {
  liveKind,
  nextSetsReadAt,
  PAUSED_POLL_MS,
  POLL_MS,
  scheduleSetsRead,
  type LiveKind,
} from './connection'
import {
  blockInterval,
  initialSchedule,
  reduceSchedule,
  seedFromCrawl,
  seedFromValidatorSets,
  upcoming,
  type ScheduleRow,
  type ScheduleState,
} from './schedule'

const NONE = {} as const

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

let visibleAt = Date.now()
function subscribeVisible(cb: () => void): () => void {
  const on = () => {
    if (document.visibilityState !== 'hidden') visibleAt = Date.now()
    cb()
  }
  document.addEventListener('visibilitychange', on)
  return () => document.removeEventListener('visibilitychange', on)
}
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
/** When the page last became visible: a page hidden for a while has not been reading, so its silence starts over. */
const visibleSinceSnapshot = () => visibleAt

/**
 * The newest proof-checked epoch answer, by Platform height: an answer from a node a block behind, landing after a
 * newer one, never moves the figures back.
 */
export function useNewestAnswer(
  answer: Sourced<EpochDto> | undefined,
): Sourced<EpochDto> | undefined {
  const [newest, setNewest] = useState(answer)
  const height = (a: Sourced<EpochDto> | undefined) => a?.height ?? -1
  if (answer && answer !== newest && height(answer) > height(newest)) setNewest(answer)
  return newest && height(newest) >= height(answer) ? newest : answer
}

/** A Platform block time the page can show: a positive safe integer, not past the browser's clock by more than a minute. */
const plausibleTime = (ms: number, now: number) =>
  Number.isSafeInteger(ms) && ms > 0 && ms <= now + 60_000

/** A clock that ticks every second while the page is visible, for the countdown and the ages beside it. */
function useSecondClock(visible: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!visible) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [visible])
  return now
}

export interface LiveSchedule {
  state: ScheduleState
  rows: ScheduleRow[]
  kind: LiveKind
  now: number
  /** The time a block takes on this chain, as measured (see `blockInterval`). */
  blockMs: number
  /** The newest proof-checked read of the current epoch: its stamp carries the Platform height and the ChainLock. */
  epoch?: Sourced<EpochDto>
  /** The newest validator-set answer, and whether the last read of it failed. */
  sets?: Sourced<unknown>
  /** The last validator-set read failed, with this error. */
  setsError?: unknown
  retry: () => void
}

/**
 * Follows the Platform chain for the schedule: reads the current epoch every few seconds (one small proof-checked SDK
 * call, whose answer is at the newest block), reads the validator sets over DAPI again once a block lands, and keeps
 * the crawl's schedule as the cold start. Mount it under a `key` of the network, so a switch starts over.
 */
export function useLiveSchedule(net: NetworkId, crawl?: Sourced<RadarPlatform>): LiveSchedule {
  const ready = useAfterIdle()
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true)
  const visible = useSyncExternalStore(subscribeVisible, isVisible, () => true)
  const now = useSecondClock(visible)
  const visibleSince = useSyncExternalStore(subscribeVisible, visibleSinceSnapshot, () => 0)
  const [startedAt] = useState(() => Date.now())
  const [state, dispatch] = useReducer(reduceSchedule, initialSchedule)

  const tip = useQuery({
    ...sdkQueries['epoch.current'](net, NONE),
    enabled: ready,
    refetchInterval: (q) => (q.state.status === 'error' ? PAUSED_POLL_MS : POLL_MS),
    refetchIntervalInBackground: false,
  })
  const sets = useQuery({ ...platformDapiQueries.currentQuorums(net), enabled: ready })

  const answer = useNewestAnswer(tip.data)
  useEffect(() => {
    if (answer?.height === undefined || answer.asOfFetched || !answer.proved) return
    if (!Number.isSafeInteger(answer.height) || !plausibleTime(answer.asOf, Date.now())) return
    dispatch({ type: 'tip', height: answer.height, timeMs: answer.asOf })
  }, [answer])

  const setsAnswer = sets.data
  useEffect(() => {
    if (!setsAnswer) return
    dispatch({
      type: 'seed',
      seed: seedFromValidatorSets(
        setsAnswer.data,
        { height: setsAnswer.data.meta.height, timeMs: setsAnswer.asOf },
        stampOf(setsAnswer),
      ),
    })
  }, [setsAnswer])

  useEffect(() => {
    if (crawl) dispatch({ type: 'seed', seed: seedFromCrawl(crawl.data.schedule, stampOf(crawl)) })
  }, [crawl])
  const schedule = crawl?.data.schedule

  const failing = tip.status === 'error'
  const blockMs = blockInterval({
    epoch: answer?.data,
    tip: state.tip,
    crawlBlockSecs: schedule?.block_secs,
    mainnet: net === 'mainnet',
  })
  const kind = liveKind({
    now,
    startedAt,
    lastOkAt: tip.dataUpdatedAt > 0 ? tip.dataUpdatedAt : undefined,
    failing,
    online,
    visible,
    visibleSince,
    tipTimeMs: state.tip?.timeMs,
    blockMs,
  })

  // Read the validator sets again once a block lands that the order was not read at.
  const tries = useRef({ height: -1, n: 0 })
  const tipHeight = state.tip?.height
  const setsHeight = state.dapi?.height
  const lastReadAt = Math.max(sets.dataUpdatedAt, sets.errorUpdatedAt) || undefined
  const refetchSets = sets.refetch
  const fetchingSets = sets.isFetching
  const paused = kind === 'paused'
  useEffect(() => {
    if (!ready || fetchingSets || !visible || tipHeight === undefined) return
    if (tries.current.height !== tipHeight) tries.current = { height: tipHeight, n: 0 }
    const at = nextSetsReadAt({
      now: Date.now(),
      tipHeight,
      setsHeight,
      lastReadAt,
      triesForTip: tries.current.n,
      paused,
    })
    if (at === undefined) return
    return scheduleSetsRead(at, Date.now(), {
      canRead: () => budget.snapshot(net).pressure === 'ok',
      read: () => {
        tries.current = { height: tipHeight, n: tries.current.n + 1 }
        void refetchSets()
      },
    })
  }, [ready, fetchingSets, visible, tipHeight, setsHeight, lastReadAt, paused, net, refetchSets])

  const refetchTip = tip.refetch
  const retry = useCallback(() => {
    tries.current = { height: -1, n: 0 }
    void refetchTip()
    void refetchSets()
  }, [refetchTip, refetchSets])

  const rows = useMemo(() => upcoming(state), [state])
  return {
    state,
    rows,
    kind,
    now,
    blockMs,
    epoch: answer,
    sets: setsAnswer,
    setsError: sets.status === 'error' ? sets.error : undefined,
    retry,
  }
}
