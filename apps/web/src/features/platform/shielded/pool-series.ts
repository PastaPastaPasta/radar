import { creditsToDash as dash } from '@/lib/units'

interface Point {
  t: number
  amount: bigint
}

/** Shielded and unshielded amounts on one time axis: every bucket either side has, 0 where one side has none. */
export function poolSeries(shielded: readonly Point[], unshielded: readonly Point[]) {
  const into = new Map(shielded.map((p) => [p.t, dash(p.amount)]))
  const out = new Map(unshielded.map((p) => [p.t, dash(p.amount)]))
  const times = [...new Set([...into.keys(), ...out.keys()])].sort((a, b) => a - b)
  return {
    times,
    shielded: times.map((ms) => into.get(ms) ?? 0),
    unshielded: times.map((ms) => out.get(ms) ?? 0),
  }
}
