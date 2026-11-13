import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Empty, KeyValue } from '@/ui'
import { loadState, useSetSearch, type IdentityTabProps } from './common'
import { ContractInput } from './GroupsTab'
import { useKeyColumns } from './KeysTab'

export function AdvancedTab({
  id,
  contract,
}: IdentityTabProps & { contract?: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const setSearch = useSetSearch()
  const columns = useKeyColumns()
  const args = { id, contractId: contract ?? '' }
  const nonce = useQuery({
    ...sdkQueries['identities.contractNonce'](net, args),
    enabled: contract !== undefined,
  })
  const keys = useQuery({
    ...sdkQueries['identities.contractKeys'](net, args),
    enabled: contract !== undefined,
  })
  return (
    <Card
      title={t`Contract details`}
      layer="platform"
      id="identity-advanced"
      subtitle={t`This identity’s nonce for a contract and the keys bound to it.`}
    >
      <ContractInput
        key={contract ?? ''}
        initial={contract}
        label={t`Contract ID`}
        onSubmit={(c) => {
          setSearch({ contract: c })
        }}
      />
      {contract === undefined ? (
        <Empty kind="none-yet" title={t`Enter a contract ID to see its nonce and keys.`} />
      ) : (
        <>
          <KeyValue
            items={[
              { label: t`Contract`, value: <Entity kind="contract" id={contract} /> },
              {
                label: t`Contract nonce`,
                value: nonce.isPending ? (
                  t`Loading…`
                ) : nonce.isError ? (
                  t`Not available`
                ) : (
                  <span data-field="contract-nonce">{formatInt(nonce.data?.data ?? 0n)}</span>
                ),
                source: nonce.data ? stampOf(nonce.data) : undefined,
              },
            ]}
          />
          <DataTable
            caption={t`Keys bound to the contract`}
            columns={columns}
            rows={keys.data?.data ?? []}
            getRowId={(k) => String(k.id)}
            state={loadState(keys)}
            error={keys.error}
            onRetry={() => void keys.refetch()}
            source={keys.data ? stampOf(keys.data) : undefined}
            empty={
              <Empty
                kind="none-yet"
                title={t`No keys of this identity are bound to that contract.`}
              />
            }
          />
        </>
      )}
    </Card>
  )
}
