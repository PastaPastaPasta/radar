import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { Entity, PageLink } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Badge, Card, DataTable, Empty, JsonView, KeyValue } from '@/ui'
import { loadState } from '../identity/common'
import {
  descriptionOf,
  flagsOf,
  HISTORY_LABELS,
  mainControlGroupOf,
  rulesOf,
  supplyOf,
  type ActionTaker,
  type RuleRow,
} from './token-config'
import { tokenAmountKind, type TokenView } from './use-token'

function Taker({ taker, contractId }: { taker: ActionTaker; contractId: string | undefined }) {
  const { t } = useLingui()
  switch (taker.kind) {
    case 'no-one':
      return <Badge>{t`No one`}</Badge>
    case 'owner':
      return <Badge tone="info">{t`Contract owner`}</Badge>
    case 'main-group':
      return <Badge tone="info">{t`Main control group`}</Badge>
    case 'group':
      return contractId ? (
        <PageLink to={`/group/${contractId}/${taker.position}`}>
          {t`Group ${taker.position}`}
        </PageLink>
      ) : (
        <Badge tone="info">{t`Group ${taker.position}`}</Badge>
      )
    case 'identity':
      return <Entity kind="identity" id={taker.id} />
    case 'unknown':
      return <Badge>{taker.type === '' ? t`Not stated` : taker.type}</Badge>
  }
}

export function DefinitionTab({ token }: { token: TokenView }) {
  const { t, i18n } = useLingui()
  const { contract, config, origin } = token
  const kind = tokenAmountKind(token)
  const contractId = origin?.contractId

  const rules = useMemo(() => (config ? rulesOf(config) : []), [config])
  const columns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        id: 'action',
        header: t`Action`,
        cell: ({ row }) => i18n._(row.original.label),
        meta: { phone: 'title' },
      },
      {
        id: 'who',
        header: t`Who may do it`,
        cell: ({ row }) => <Taker taker={row.original.authorized} contractId={contractId} />,
        meta: { phone: 'primary' },
      },
      {
        id: 'admin',
        header: t`Who may change the rule`,
        cell: ({ row }) => <Taker taker={row.original.admin} contractId={contractId} />,
        meta: { phone: 'secondary' },
      },
    ],
    [t, i18n, contractId],
  )

  if (contract.isPending || (token.info.isPending && !token.info.data)) {
    return <Card title={t`Configuration`} layer="platform" state="loading" children={null} />
  }
  if (!config) {
    return (
      <Card
        title={t`Configuration`}
        layer="platform"
        id="token-definition"
        state={contract.isError ? 'error' : 'ready'}
        error={contract.error}
        onRetry={() => void contract.refetch()}
      >
        <Empty
          kind="not-found"
          title={t`The contract does not list this token.`}
          body={t`The token's configuration is read from the contract that defines it.`}
        />
      </Card>
    )
  }
  const flags = flagsOf(config)
  const base = supplyOf(config, 'baseSupply')
  const max = supplyOf(config, 'maxSupply')
  const group = mainControlGroupOf(config)
  const description = descriptionOf(config)
  const kept = flags.keepsHistory.filter((h) => h.on).map((h) => i18n._(HISTORY_LABELS[h.key]))
  const source = contract.data ? stampOf(contract.data) : undefined
  const names = Object.entries(token.localizations)

  return (
    <div className="grid gap-6">
      <Card
        title={t`Configuration`}
        layer="platform"
        id="token-definition"
        source={source}
        state={loadState(contract)}
      >
        <KeyValue
          columns={2}
          items={[
            {
              label: t`Decimals`,
              value: token.decimals === undefined ? '—' : formatInt(token.decimals),
            },
            {
              label: t`Base supply`,
              value: base !== undefined && kind ? <Amount value={base} kind={kind} /> : '—',
            },
            {
              label: t`Maximum supply`,
              value: max !== undefined && kind ? <Amount value={max} kind={kind} /> : t`No maximum`,
            },
            {
              label: t`Starts paused`,
              value: flags.startsPaused ? t`Yes` : t`No`,
            },
            {
              label: t`Transfers to a frozen balance`,
              value: flags.allowsTransferToFrozen ? t`Allowed` : t`Not allowed`,
            },
            {
              label: t`Main control group`,
              value:
                group !== undefined && contractId ? (
                  <PageLink to={`/group/${contractId}/${group}`}>{t`Group ${group}`}</PageLink>
                ) : (
                  t`None`
                ),
            },
            {
              label: t`History kept for`,
              value: kept.length > 0 ? kept.join(', ') : t`Nothing`,
            },
            ...(description ? [{ label: t`Description`, value: description }] : []),
          ]}
        />
      </Card>
      <Card title={t`Who may do what`} layer="platform" id="token-rules" source={source}>
        <DataTable
          caption={t`Who may do what`}
          columns={columns}
          rows={rules}
          getRowId={(r) => r.key}
          state={rules.length > 0 ? 'ready' : 'empty'}
          empty={<Empty kind="none-yet" title={t`The configuration lists no rules.`} />}
        />
      </Card>
      <Card title={t`Names`} layer="platform" id="token-names" source={source}>
        <DataTable
          caption={t`Names`}
          columns={[
            {
              id: 'locale',
              header: t`Language`,
              accessorFn: ([locale]) => locale,
              meta: { phone: 'title' },
            },
            {
              id: 'singular',
              header: t`Singular`,
              accessorFn: ([, l]) => l.singular,
              meta: { phone: 'primary' },
            },
            {
              id: 'plural',
              header: t`Plural`,
              accessorFn: ([, l]) => l.plural,
              meta: { phone: 'secondary' },
            },
          ]}
          rows={names}
          getRowId={([locale]) => locale}
          state={names.length > 0 ? 'ready' : 'empty'}
          empty={<Empty kind="none-yet" title={t`The contract gives this token no names.`} />}
        />
      </Card>
      <Card title={t`Raw configuration`} layer="platform" id="token-raw" source={source}>
        <JsonView value={config} collapsedDepth={1} label={t`Token configuration`} />
      </Card>
    </div>
  )
}
