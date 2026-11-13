import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import type { ContestVoteStateDto } from '@/data/sdk/methods/p-vote'
import { IdentityRef } from '@/features/entity'
import { formatInt } from '@/lib/format'

export interface TallySlice {
  id: string
  kind: 'contender' | 'abstain' | 'lock'
  votes: number
  label: ReactNode
}

const COLORS = [
  'var(--dh-brand)',
  'color-mix(in oklab, var(--dh-brand) 60%, var(--dh-ink))',
  'color-mix(in oklab, var(--dh-brand) 45%, var(--dh-sunken))',
  'color-mix(in oklab, var(--dh-brand) 30%, var(--dh-ink))',
]
const ABSTAIN = 'var(--dh-warn)'
const LOCK = 'var(--dh-bad)'

/** One slice per contender, then abstain and lock: the same rows the bar and its table draw. */
export function useTallySlices(
  state: ContestVoteStateDto,
  aliasOf?: ReadonlyMap<string, string | undefined>,
): TallySlice[] {
  const { t } = useLingui()
  return [
    ...state.contenders.map((c) => ({
      id: c.identityId,
      kind: 'contender' as const,
      votes: c.voteTally ?? 0,
      label: <IdentityRef id={c.identityId} label={aliasOf?.get(c.identityId)} />,
    })),
    { id: 'abstain', kind: 'abstain' as const, votes: state.abstainVotes ?? 0, label: t`Abstain` },
    { id: 'lock', kind: 'lock' as const, votes: state.lockVotes ?? 0, label: t`Lock` },
  ]
}

export const totalVotes = (slices: readonly TallySlice[]): number =>
  slices.reduce((n, s) => n + s.votes, 0)

/** A one-line tally for a list row: votes towards contenders, then abstain and lock. */
export function TallyText({ state }: { state: ContestVoteStateDto }) {
  const { t } = useLingui()
  const towards = state.contenders.reduce((n, c) => n + (c.voteTally ?? 0), 0)
  return (
    <span data-tally>
      {t`${formatInt(towards)} towards · ${formatInt(state.abstainVotes ?? 0)} abstain · ${formatInt(state.lockVotes ?? 0)} lock`}
    </span>
  )
}

/** The tally as a stacked bar, with the same numbers in a table for a screen reader and for exact reading. */
export function TallyBar({ slices }: { slices: TallySlice[] }) {
  const { t } = useLingui()
  const total = totalVotes(slices)
  let contender = 0
  const colored = slices.map((s) => ({
    ...s,
    color:
      s.kind === 'abstain'
        ? ABSTAIN
        : s.kind === 'lock'
          ? LOCK
          : COLORS[contender++ % COLORS.length]!,
  }))
  const caption = t`Votes by choice`
  return (
    <div className="grid gap-3" data-tally-bar>
      <div
        role="img"
        aria-label={t`${formatInt(total)} votes: ${colored.map((s) => `${formatInt(s.votes)}`).join(', ')}`}
        className="flex h-4 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--dh-sunken)' }}
      >
        {total > 0
          ? colored.map((s) =>
              s.votes > 0 ? (
                <i
                  key={s.id}
                  data-slice={s.id}
                  style={{ width: `${(s.votes / total) * 100}%`, background: s.color }}
                />
              ) : null,
            )
          : null}
      </div>
      <table className="dh-table dh-table--compact" data-tally-table>
        <caption className="dh-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t`Choice`}</th>
            <th scope="col" className="text-end">
              {t`Votes`}
            </th>
            <th scope="col" className="text-end">
              {t`Share`}
            </th>
          </tr>
        </thead>
        <tbody>
          {colored.map((s) => (
            <tr key={s.id} data-choice={s.id}>
              <td>
                <span
                  aria-hidden
                  className="mr-2 inline-block size-2.5 rounded-sm align-middle"
                  style={{ background: s.color }}
                />
                {s.label}
              </td>
              <td className="text-end rx-num">{formatInt(s.votes)}</td>
              <td className="text-end rx-num">
                {total > 0 ? `${((s.votes / total) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
