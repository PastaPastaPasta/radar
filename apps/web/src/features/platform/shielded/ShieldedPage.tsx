import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { ShieldedNoteDto } from '@/data/sdk/methods/p-chain'
import { sdkQueries } from '@/data/sdk/queries'
import { PageFrame, PageGroupTabs, useNetwork } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { isHex, normalizeHex } from '@/lib/hex'
import { isDevnet } from '@/lib/network'
import {
  Amount,
  Badge,
  Card,
  Copy,
  DataTable,
  Empty,
  ErrorState,
  Hash,
  Skeleton,
  Stat,
  Stats,
} from '@/ui'
import { useLookupForm } from '../quorums/lookup-form'
import { queryView, stampsOf, useAfterIdle } from '../quorums/state'
import { ShieldedChart } from './ShieldedChart'

const NONE = {} as const
/** The pool serves notes from a start index that is a multiple of this. */
const NOTES_CHUNK = 2048
const NOTES_SHOWN = 10
const ANCHORS_SHOWN = 10

/** A nullifier typed as 64 hex characters (with or without 0x), lower-cased; `undefined` when it is not one. */
export function parseNullifier(input: string): string | undefined {
  const hex = normalizeHex(input)
  return isHex(hex, 32) ? hex : undefined
}

/** NX-58: the shielded pool as the Platform nodes prove it, and a lookup of one nullifier. */
export function ShieldedPage() {
  const { t } = useLingui()
  const { nf, range } = useSearch({ from: '/shielded' })
  return (
    <PageFrame
      path="/shielded"
      title={t`Shielded pool`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`The pool of shielded credits: its balance, the anchors it accepts, its encrypted notes, and whether a nullifier has been spent.`}
    >
      <PageGroupTabs group="chain" />
      <PoolState />
      <Nullifier nf={nf} />
      <Notes />
      <Anchors />
      <ShieldedChart range={range} />
    </PageFrame>
  )
}

function PoolState() {
  const { t } = useLingui()
  const net = useNetwork()
  const ready = useAfterIdle()
  const pool = useQuery({ ...sdkQueries['shielded.poolState'](net, NONE), enabled: ready })
  const recent = useQuery({ ...sdkQueries['shielded.mostRecentAnchor'](net, NONE), enabled: ready })
  return (
    <Card
      id="pool"
      layer="platform"
      title={t`Pool state`}
      source={stampsOf(pool.data, recent.data)}
      {...queryView(pool)}
    >
      {pool.data ? (
        <div className="grid grid-cols-1 gap-4">
          <Stats>
            <Stat
              label={t`Balance in the pool`}
              value={<Amount value={pool.data.data ?? 0n} kind="credits" fiat />}
              size="lg"
              layer="platform"
            />
          </Stats>
          <div data-recent-anchor>
            <p className="text-sm">{t`Most recent anchor`}</p>
            {recent.data ? (
              recent.data.data === null ? (
                <p>{t`The pool has no anchor yet.`}</p>
              ) : (
                <Hash value={recent.data.data} display="wrap" phoneShort />
              )
            ) : recent.isError ? (
              <ErrorState
                error={recent.error}
                onRetry={() => {
                  void recent.refetch()
                }}
              />
            ) : (
              <Skeleton shape="block" />
            )}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function Nullifier({ nf }: { nf: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const { draft, setDraft, submit } = useLookupForm('/shielded', 'nf', nf)
  const parsed = nf === undefined ? undefined : parseNullifier(nf)
  const invalid = nf !== undefined && parsed === undefined
  const status = useQuery({
    ...sdkQueries['shielded.nullifiers'](net, { nullifiers: [parsed ?? ''] }),
    enabled: parsed !== undefined,
  })
  const spent = parsed === undefined ? undefined : status.data?.data.get(parsed)
  return (
    <Card
      id="nullifier"
      layer="platform"
      title={t`Nullifier lookup`}
      subtitle={t`A nullifier is published when a shielded note is spent. Paste one to see whether the pool has it.`}
      source={stampsOf(status.data)}
    >
      <div className="grid grid-cols-1 gap-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          <label className="rx-grow grid gap-1 text-sm">
            <span>{t`Nullifier`}</span>
            <input
              className="dh-input"
              name="nf"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder={t`64 hex characters`}
              aria-invalid={invalid || undefined}
            />
          </label>
          <button type="submit" className="dh-btn">
            {t`Look up`}
          </button>
        </form>
        {invalid ? (
          <Empty
            kind="no-match"
            title={t`That is not a nullifier`}
            body={t`A nullifier is 32 bytes, written as 64 hex characters.`}
          />
        ) : parsed === undefined ? null : status.isError && status.data === undefined ? (
          <ErrorState
            error={status.error}
            onRetry={() => {
              void status.refetch()
            }}
          />
        ) : spent === undefined ? (
          <Skeleton shape="block" />
        ) : (
          <div data-nullifier-result={spent ? 'spent' : 'unspent'} className="grid gap-2">
            <p>
              {spent ? (
                <Badge tone="warning">{t`Spent`}</Badge>
              ) : (
                <Badge tone="success">{t`Not spent`}</Badge>
              )}{' '}
              {spent
                ? t`The pool has this nullifier: its note was spent.`
                : t`The pool has no such nullifier.`}
            </p>
            <Hash value={parsed} display="wrap" phoneShort />
          </div>
        )}
      </div>
    </Card>
  )
}

function Notes() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const ready = useAfterIdle()
  const [chunk, setChunk] = useState(0)
  const start = chunk * NOTES_CHUNK
  const answer = useQuery({
    ...sdkQueries['shielded.encryptedNotes'](net, { startIndex: start, count: NOTES_SHOWN }),
    enabled: ready,
  })
  const pool = useQuery({ ...peQueries.shieldedPool(net), enabled: !off && !isDevnet(net) })
  const total = pool.data?.data.notesCount
  const rows = answer.data?.data ?? []
  const last = total === undefined ? undefined : Math.max(0, Math.ceil(total / NOTES_CHUNK) - 1)
  const hasNext = last === undefined ? rows.length >= NOTES_SHOWN : chunk < last
  const columns = useMemo<ColumnDef<ShieldedNoteDto>[]>(
    () => [
      {
        id: 'index',
        header: '#',
        accessorFn: (r) => formatInt(r.index),
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'cmx',
        header: t`Commitment`,
        cell: ({ row }) => <Hash value={row.original.cmx} />,
        meta: { phone: 'primary' },
      },
      {
        id: 'nullifier',
        header: t`Nullifier`,
        cell: ({ row }) => <Hash value={row.original.nullifier} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'note',
        header: t`Encrypted note`,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            {formatBytes(row.original.encryptedNote.length / 2)}
            <Copy value={row.original.encryptedNote} label={t`Copy encrypted note`} />
          </span>
        ),
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      id="notes"
      layer="platform"
      title={t`Encrypted notes`}
      subtitle={
        total === undefined
          ? t`The pool serves its notes in chunks of ${formatInt(NOTES_CHUNK)}. The first ${NOTES_SHOWN} of the chunk starting at note ${formatInt(start)} are shown.`
          : t`The pool holds ${formatInt(total)} notes, served in chunks of ${formatInt(NOTES_CHUNK)}. The first ${NOTES_SHOWN} of the chunk starting at note ${formatInt(start)} are shown.`
      }
      padding="flush"
      source={stampsOf(answer.data)}
    >
      <DataTable
        caption={t`Encrypted notes of the shielded pool`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.index)}
        {...queryView(answer)}
        empty={t`The pool has no notes at this position.`}
      />
      <div className="rx-pager" role="group" aria-label={t`Chunks of notes`}>
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          disabled={chunk === 0}
          onClick={() => {
            setChunk((c) => Math.max(0, c - 1))
          }}
        >
          {t`Previous chunk`}
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          disabled={!hasNext}
          onClick={() => {
            setChunk((c) => c + 1)
          }}
        >
          {t`Next chunk`}
        </button>
      </div>
    </Card>
  )
}

function Anchors() {
  const { t } = useLingui()
  const net = useNetwork()
  const ready = useAfterIdle()
  const [shown, setShown] = useState(ANCHORS_SHOWN)
  const anchors = useQuery({ ...sdkQueries['shielded.anchors'](net, NONE), enabled: ready })
  const list = anchors.data?.data ?? []
  return (
    <Card
      id="anchors"
      layer="platform"
      title={t`Anchors`}
      subtitle={
        anchors.data
          ? t`${formatInt(list.length)} anchors the pool accepts a spend against.`
          : t`The roots of the note tree that a spend may be proved against.`
      }
      source={stampsOf(anchors.data)}
      {...queryView(anchors)}
    >
      {anchors.data ? (
        list.length === 0 ? (
          <Empty kind="none-yet" title={t`The pool has no anchors yet.`} />
        ) : (
          <div className="grid gap-2">
            <ol className="grid gap-1" data-anchors>
              {list.slice(0, shown).map((a) => (
                <li key={a}>
                  <Hash value={a} display="wrap" phoneShort />
                </li>
              ))}
            </ol>
            {shown < list.length ? (
              <button
                type="button"
                className="dh-btn dh-btn--sm"
                onClick={() => {
                  setShown((n) => n + ANCHORS_SHOWN)
                }}
              >
                {t`Show more`}
              </button>
            ) : null}
          </div>
        )
      ) : null}
    </Card>
  )
}
