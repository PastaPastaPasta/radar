import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Empty, KeyValue } from '@/ui'
import { loadState, type IdentityTabProps } from './common'
import { ContractForm } from './IdForm'
import { useKeyColumns } from './KeysTab'

export function AdvancedTab({
  id,
  contract,
}: IdentityTabProps & { contract?: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const columns = useKeyColumns()
  const [refused, setRefused] = useState(false)
  const nonce = useQuery({
    ...sdkQueries['identities.contractNonce'](net, { id, contractId: contract ?? '' }),
    enabled: contract !== undefined,
  })
  const identityKeys = useQuery({
    ...sdkQueries['identities.getKeys'](net, { id }),
    enabled: contract !== undefined,
  })
  const keys = {
    ...identityKeys,
    data: identityKeys.data && {
      ...identityKeys.data,
      data: identityKeys.data.data.filter(
        (k) => k.contractBounds?.type !== 'contractGroup' && k.contractBounds?.id === contract,
      ),
    },
  }
  return (
    <Card
      title={t`Contract details`}
      layer="platform"
      id="identity-advanced"
      subtitle={t`This identity’s nonce for a contract and the keys bound to it, including keys bound to one document type of it.`}
    >
      <ContractForm
        contract={contract}
        onInvalid={() => {
          setRefused(true)
        }}
        onSubmitted={() => {
          setRefused(false)
        }}
      />
      {contract === undefined || refused ? (
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
