import type { DecodedTx, PrevOut } from '@/data/core/types'

export const prevoutKey = (txid: string, vout: number) => `${txid}:${vout}`

export const isCoinbaseTx = (tx: Pick<DecodedTx, 'inputs'>): boolean =>
  tx.inputs.some((i) => i.coinbase !== undefined || /^0+$/.test(i.txid))

export const sumOutputs = (tx: Pick<DecodedTx, 'outputs'>): bigint =>
  tx.outputs.reduce((sum, o) => sum + o.value, 0n)

/** What each input spends, in input order. `undefined` where the previous output was not loaded. */
export function inputValues(
  tx: Pick<DecodedTx, 'inputs'>,
  prevouts: ReadonlyMap<string, PrevOut> | undefined,
): (PrevOut | undefined)[] {
  return tx.inputs.map((i) => prevouts?.get(prevoutKey(i.txid, i.vout)))
}

export interface Totals {
  in?: bigint
  out: bigint
  fee?: bigint
}

/**
 * The fee is inputs minus outputs, known only once every input's previous output is. An asset unlock has
 * no inputs and carries its own fee in the payload; a coinbase pays no fee; any other transaction without inputs
 * (a quorum commitment, an upgrade signal) spends nothing, so it pays nothing.
 */
export function totals(tx: DecodedTx, prevouts: ReadonlyMap<string, PrevOut> | undefined): Totals {
  const out = sumOutputs(tx)
  if (tx.payload?.kind === 'assetUnlockTx') {
    const fee = tx.payload.fee
    return { out, fee: typeof fee === 'bigint' ? fee : undefined }
  }
  if (isCoinbaseTx(tx)) return { out }
  if (tx.inputs.length === 0) return { in: 0n, out, fee: 0n }
  const values = inputValues(tx, prevouts)
  if (values.some((v) => v === undefined)) return { out }
  const total = values.reduce((sum, v) => sum + (v?.value ?? 0n), 0n)
  return { in: total, out, fee: total - out }
}

/** A transaction that spends nothing and creates nothing: no ribbon can say anything true about it. */
export const movesNoValue = (tx: Pick<DecodedTx, 'inputs' | 'outputs' | 'payload'>): boolean =>
  tx.inputs.length === 0 && tx.payload?.kind !== 'assetUnlockTx' && sumOutputs(tx) === 0n

/** Addresses the inputs spend from, so an output back to one of them reads as change. */
export function senderAddresses(values: (PrevOut | undefined)[]): Set<string> {
  return new Set(values.flatMap((v) => (v?.address ? [v.address] : [])))
}

export const shortAddress = (address: string) =>
  address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address

export interface FlowNode {
  key: string
  label: string
  value: bigint
  kind: 'in' | 'out' | 'change' | 'fee'
  /** Address behind the label, for a link. */
  address?: string
}

interface FlowInput {
  inputs: FlowNode[]
  outputs: FlowNode[]
}

const MAX_NODES = 8

/** Collapses a long side into its first nodes plus one "N more" node, so the picture stays readable. */
export function limitNodes(nodes: FlowNode[], more: (count: number) => string): FlowNode[] {
  if (nodes.length <= MAX_NODES) return nodes
  const head = nodes.slice(0, MAX_NODES - 1)
  const rest = nodes.slice(MAX_NODES - 1)
  return [
    ...head,
    {
      key: 'more',
      label: more(rest.length),
      value: rest.reduce((s, n) => s + n.value, 0n),
      kind: rest[0]?.kind ?? 'out',
    },
  ]
}

interface PlacedNode extends FlowNode {
  x: number
  y: number
  h: number
}

export interface Ribbon {
  d: string
  kind: FlowNode['kind']
}

interface FlowLayout {
  left: PlacedNode[]
  right: PlacedNode[]
  ribbons: Ribbon[]
  /** At least one node was drawn taller than its share so that it stays visible. */
  raised: boolean
}

/** `min` and `gap` leave room for a node's amount and its identity on two lines. */
export const FLOW = { width: 1060, left: 300, right: 760, top: 20, area: 280, gap: 12, min: 22 }

function heights(values: number[], k: number): number[] {
  return values.map((v) => Math.max(FLOW.min, v * k))
}

const span = (hs: number[]) => hs.reduce((a, b) => a + b, 0) + FLOW.gap * Math.max(0, hs.length - 1)

/** Scale (px per unit) at which both sides fit the drawing area; found by bisection since minimum heights make it non-linear. */
function fitScale(left: number[], right: number[]): number {
  const total =
    Math.max(
      left.reduce((a, b) => a + b, 0),
      right.reduce((a, b) => a + b, 0),
    ) || 1
  let lo = 0
  let hi = FLOW.area / total
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const fits = Math.max(span(heights(left, mid)), span(heights(right, mid))) <= FLOW.area
    if (fits) lo = mid
    else hi = mid
  }
  return lo
}

const f = (n: number) => n.toFixed(1)

function ribbonPath(
  x0: number,
  a0: number,
  a1: number,
  x1: number,
  b0: number,
  b1: number,
): string {
  const mid = (x0 + x1) / 2
  return `M${x0} ${f(a0)}C${mid} ${f(a0)} ${mid} ${f(b0)} ${x1} ${f(b0)}L${x1} ${f(b1)}C${mid} ${f(b1)} ${mid} ${f(a1)} ${x0} ${f(a1)}Z`
}

/** Places the two columns of nodes and the ribbons between them; each input's ribbon splits across the outputs by their share. */
export function layoutFlow({ inputs, outputs }: FlowInput): FlowLayout {
  const lv = inputs.map((n) => Number(n.value))
  const rv = outputs.map((n) => Number(n.value))
  const k = fitScale(lv, rv)
  const lh = heights(lv, k)
  const rh = heights(rv, k)
  const raised = [
    ...lv.map((v, i) => v * k < (lh[i] ?? 0)),
    ...rv.map((v, i) => v * k < (rh[i] ?? 0)),
  ].some(Boolean)
  const place = (nodes: FlowNode[], hs: number[], x: number): PlacedNode[] => {
    let y = FLOW.top + (FLOW.area - span(hs)) / 2
    return nodes.map((n, i) => {
      const placed = { ...n, x, y, h: hs[i] ?? FLOW.min }
      y += placed.h + FLOW.gap
      return placed
    })
  }
  const left = place(inputs, lh, FLOW.left)
  const right = place(outputs, rh, FLOW.right)
  const lTotal = lv.reduce((a, b) => a + b, 0) || 1
  const rTotal = rv.reduce((a, b) => a + b, 0) || 1
  const ribbons: Ribbon[] = []
  const rightUsed = right.map(() => 0)
  left.forEach((l, i) => {
    let used = 0
    right.forEach((r, j) => {
      const share = (rv[j] ?? 0) / rTotal
      const a0 = l.y + used
      const a1 = a0 + l.h * share
      used += l.h * share
      const take = (lv[i] ?? 0) / lTotal
      const b0 = r.y + (rightUsed[j] ?? 0)
      const b1 = b0 + r.h * take
      rightUsed[j] = (rightUsed[j] ?? 0) + r.h * take
      if (a1 - a0 < 0.3 && b1 - b0 < 0.3) return
      ribbons.push({ d: ribbonPath(FLOW.left, a0, a1, FLOW.right, b0, b1), kind: r.kind })
    })
  })
  return { left, right, ribbons, raised }
}
