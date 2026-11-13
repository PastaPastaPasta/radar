import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, KeyValue, Unavailable } from '@/ui'
import { loadState, nameLabel, type IdentityTabProps } from './common'

export const NAMES_LIMIT = 100

export function OverviewTab({ id }: IdentityTabProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const balance = useQuery(sdkQueries['identities.balanceAndRevision'](net, { id }))
  const nonce = useQuery(sdkQueries['identities.nonce'](net, { id }))
  const names = useQuery(sdkQueries['dpns.usernames'](net, { identityId: id, limit: NAMES_LIMIT }))
  const indexed = useQuery({ ...peQueries.identity(net, id), enabled: !decentralized })

  const funding = decentralized ? (
    <Unavailable compact title={t`The funding transaction needs an indexer`} />
  ) : indexed.isPending ? (
    t`Loading…`
  ) : indexed.data?.data?.fundingCoreTx ? (
    <Entity kind="tx" id={indexed.data.data.fundingCoreTx} />
  ) : indexed.isError ? (
    t`Platform Explorer isn’t answering`
  ) : (
    t`Not indexed`
  )

  const b = balance.data
  return (
    <Card
      title={t`Summary`}
      layer="platform"
      id="identity-summary"
      state={loadState(balance)}
      error={balance.error}
      onRetry={() => void balance.refetch()}
    >
      <KeyValue
        columns={2}
        items={[
          {
            label: t`Balance`,
            value: b?.data ? (
              <span data-field="balance">
                <Amount value={b.data.balance} kind="credits" fiat />
              </span>
            ) : (
              '—'
            ),
            source: b ? stampOf(b) : undefined,
            hint: b?.data ? t`${formatInt(b.data.balance)} credits` : undefined,
          },
          {
            label: t`Revision`,
            value: b?.data ? formatInt(b.data.revision) : '—',
            source: b ? stampOf(b) : undefined,
          },
          {
            label: t`Nonce`,
            value: nonce.isPending ? t`Loading…` : nonce.data ? formatInt(nonce.data.data ?? 0n) : '—',
            source: nonce.data ? stampOf(nonce.data) : undefined,
          },
          {
            label: t`Names`,
            value: names.isPending ? (
              t`Loading…`
            ) : names.data && names.data.data.length > 0 ? (
              <span className="flex flex-wrap gap-2 pb-2">
                {names.data.data.map((n) => (
                  <Entity key={n} kind="name" id={nameLabel(n)} label={n} />
                ))}
              </span>
            ) : names.isError ? (
              t`Names aren’t available right now`
            ) : (
              t`No names`
            ),
            source: names.data ? stampOf(names.data) : undefined,
          },
          { label: t`Funded by`, value: funding },
        ]}
      />
    </Card>
  )
}
