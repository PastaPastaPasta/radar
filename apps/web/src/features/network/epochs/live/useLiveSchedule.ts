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
import { liveKind, nextSetsReadAt, PAUSED_POLL_MS, POLL_MS, type LiveKind } from './connection'
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

function subscribeVisible(cb: () => void): () => void {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

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
  const [startedAt] = useState(() => Date.now())
  const [state, dispatch] = useReducer(reduceSchedule, initialSchedule)

  const tip = useQuery({
    ...sdkQueries['epoch.current'](net, NONE),
    enabled: ready,
    refetchInterval: (q) => (q.state.status === 'error' ? PAUSED_POLL_MS : POLL_MS),
    refetchIntervalInBackground: false,
  })
  const sets = useQuery({ ...platformDapiQueries.currentQuorums(net), enabled: ready })

  const answer = tip.data
  useEffect(() => {
    if (answer?.height === undefined || answer.asOfFetched) return
    dispatch({ type: 'tip', height: answer.height, timeMs: answer.asOf })
  }, [answer])

  const setsAnswer = sets.data
  useEffect(() => {
    if (!setsAnswer) return
    dispatch({
      type: 'seed',
      seed: seedFromValidatorSets(setsAnswer.data, setsAnswer.data.meta, stampOf(setsAnswer)),
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
    tipTimeMs: state.tip?.timeMs,
    blockMs,
  })

  // Read the validator sets again once a block lands that the order was not read at.
  const tries = useRef({ height: -1, n: 0 })
  const tipHeight = state.tip?.height
  const setsHeight = setsAnswer?.height
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
    const id = window.setTimeout(
      () => {
        // A crowded DAPI pool leaves the order to move on by itself rather than queue a large read.
        if (budget.snapshot(net).pressure !== 'ok') return
        tries.current = { height: tipHeight, n: tries.current.n + 1 }
        void refetchSets()
      },
      Math.max(0, at - Date.now()),
    )
    return () => window.clearTimeout(id)
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
