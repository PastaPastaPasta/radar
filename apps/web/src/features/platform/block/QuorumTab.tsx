import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeBlock, PeQuorum } from '@/data/pe/schemas'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Empty, Hash, KeyValue } from '@/ui'

type Member = NonNullable<PeQuorum['members']>[number]

export function QuorumTab({ block, stamp }: { block: PeBlock; stamp: SourceStamp }) {
  const { t } = useLingui()
  const q = block.quorum
  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: 'member',
        header: t`Member`,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.proTxHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'service',
        header: t`Service`,
        cell: ({ row }) => row.original.service ?? '—',
        meta: { phone: 'secondary' },
      },
      {
        id: 'platform',
        header: t`Platform HTTPS`,
        cell: ({ row }) => row.original.addresses?.platform_https?.[0] ?? '—',
        meta: { phone: 'secondary' },
      },
      {
        id: 'valid',
        header: t`Status`,
        cell: ({ row }) =>
          row.original.valid ? (
            <Badge tone="success">{t`Valid`}</Badge>
          ) : (
            <Badge tone="danger">{t`Not valid`}</Badge>
          ),
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  if (!q) {
    return <Empty kind="none-yet" title={t`Platform Explorer has no quorum for this block`} />
  }
  const members = q.members ?? []
  return (
    <div className="grid gap-6">
      <Card layer="platform" title={t`Quorum that signed this block`} source={stamp}>
        <KeyValue
          columns={2}
          items={[
            { label: t`Type`, value: q.type },
            { label: t`Quorum hash`, value: <Hash value={q.quorumHash} display="wrap" /> },
            {
              label: t`Index`,
              value: q.quorumIndex == null ? '—' : formatInt(q.quorumIndex),
            },
            {
              label: t`Valid members`,
              value:
                q.numValidMembers == null
                  ? '—'
                  : t`${formatInt(q.numValidMembers)} of ${formatInt(members.length)}`,
            },
            { label: t`Health`, value: q.healthRatio ?? '—' },
            {
              label: t`Created at Core block`,
              value:
                q.creationHeight == null ? (
                  '—'
                ) : (
                  <Entity kind="block" id={String(q.creationHeight)} />
                ),
            },
            {
              label: t`Mined in Core block`,
              value: q.minedBlockHash ? <Hash value={q.minedBlockHash} /> : '—',
            },
            {
              label: t`Public key`,
              value: q.quorumPublicKey ? <Hash value={q.quorumPublicKey} /> : '—',
            },
          ]}
        />
      </Card>
      <Card
        layer="platform"
        padding="flush"
        title={t`Quorum members`}
        subtitle={t`${formatInt(members.length)} members`}
        source={stamp}
      >
        <DataTable
          caption={t`Quorum members`}
          columns={columns}
          rows={members}
          getRowId={(m) => m.proTxHash}
          state={members.length === 0 ? 'empty' : 'ready'}
          empty={<Empty kind="none-yet" title={t`Platform Explorer lists no members`} />}
        />
      </Card>
    </div>
  )
}
