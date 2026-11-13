import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Meter } from '@/ui'
import { share, when } from './v24-format'
import { blockMs } from './v24-math'

type Quorum = NonNullable<NonNullable<RadarActivationDeployment['ehf']['gate']>['quorums']>[number]

/** Block hashes start with zeros: show what tells them apart. */
const shortHash = (hash: string): string => {
  const rest = hash.replace(/^0+/, '')
  return rest.length > 12 ? `${rest.slice(0, 8)}…${rest.slice(-4)}` : rest
}

/** The masternode signal: the quorum meter and the quorums that would sign now. Hidden once the signal is mined. */
export function SignalSection({ d, stamp }: { d: RadarActivationDeployment; stamp: SourceStamp }) {
  const { t } = useLingui()
  const g = d.ehf.gate
  const o = d.outlook
  const columns = useMemo<ColumnDef<Quorum>[]>(
    () => [
      {
        id: 'quorum',
        header: t`Quorum`,
        cell: ({ row: { original: q } }) => (
          <>
            <span className="rx-mono" title={q.hash}>
              {shortHash(q.hash)}
            </span>
            {q.selected ? (
              <>
                {' '}
                <Badge tone="info" size="sm">
                  {t`would sign now`}
                </Badge>
              </>
            ) : null}
          </>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'height',
        header: t`Formed at`,
        cell: ({ row: { original: q } }) => (q.height ? t`block ${formatInt(q.height)}` : '–'),
        meta: { phone: 'secondary' },
      },
      {
        id: 'announce',
        header: t`Announce 24`,
        cell: ({ row: { original: q } }) => (
          <>
            <b>{formatInt(q.current)}</b>{' '}
            <small className="text-[var(--dh-ink-2)]">{share(q.current, q.members)}</small>
          </>
        ),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'older',
        header: t`Older`,
        cell: ({ row: { original: q } }) => formatInt(q.older),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'unknown',
        header: t`No answer`,
        cell: ({ row: { original: q } }) => formatInt(q.unknown),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'valid',
        header: t`Valid members`,
        cell: ({ row: { original: q } }) => t`${formatInt(q.valid)} of ${formatInt(q.members)}`,
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
    ],
    [t],
  )

  const note = (text: string, mined = false) => (
    <Card title={t`The masternode signal`} id="signal" layer="network" source={stamp}>
      <p data-signal-mined={mined || undefined}>{text}</p>
    </Card>
  )

  if (d.ehf.height) {
    return note(
      t`The masternodes' signal for Core 24 is in block ${formatInt(d.ehf.height)}${d.ehf.block?.time != null ? `, ${when(blockMs(d.ehf.block))}` : ''}. From the first window after it, miners' blocks decide.`,
      true,
    )
  }
  if (o.phase === 'timed_out') {
    return note(
      t`The timeout passed without the signal: masternodes no longer sign it, and no block may carry it.`,
    )
  }
  if (!g) return null
  if (g.error) return note(t`We couldn't read the signing quorum from our dashd: ${g.error}`)
  const selected = g.quorums.find((q) => q.selected) ?? g.quorums[0]
  const size = g.size ?? selected?.members ?? 0
  const threshold = g.threshold ?? 0
  return (
    <Card
      title={t`The masternode signal`}
      id="signal"
      layer="network"
      subtitle={t`Before miners' votes count, one ${g.llmq} quorum (${formatInt(size)} masternodes) must sign the Core 24 signal: ${formatInt(threshold)} of its members, running Dash Core 24. A miner then puts it in a block.`}
      source={stamp}
      padding="flush"
    >
      <div className="grid gap-4 p-5" data-v24-signal>
        {selected && size > 0 ? (
          <Meter
            value={selected.current}
            max={size}
            label={t`Members of the quorum that would sign now that announce Dash Core 24`}
            format={(v) => t`${formatInt(v)} of ${formatInt(selected.members)}`}
            marker={{ at: threshold, label: t`${formatInt(threshold)} must sign` }}
          />
        ) : null}
        <p className="text-sm text-[var(--dh-ink-2)]">
          {t`Which quorum signs depends on the request and on which quorums are active then (a new one forms about every day), so here are the ${formatInt(g.quorums.length)} active now, the one that would sign now first.`}
        </p>
      </div>
      <DataTable
        caption={t`Quorums that would sign the Core 24 signal`}
        columns={columns}
        rows={g.quorums}
        getRowId={(q) => q.hash}
        state="ready"
      />
      <p className="p-5 text-sm text-[var(--dh-ink-2)]">
        {t`"Announce 24" counts valid members whose latest handshake with our crawler, in the past week, gave protocol ${String(g.min_protocol)} or newer. That's an estimate of who can sign, not the trigger itself: the signal needs that many actual signatures from one quorum, and members we couldn't reach may still sign. It can also count too many: release candidates 1 to 4 announce the same version and protocol but never sign Core 24 on mainnet, so a masternode still on one should upgrade.`}
        {g.request_id ? (
          <>
            {' '}
            {t`Request id`} <code className="break-all">{g.request_id}</code>.
          </>
        ) : null}
      </p>
    </Card>
  )
}
