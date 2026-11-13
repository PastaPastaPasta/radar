import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { wellKnownContracts } from '@/lib/well-known'
import { Card, Empty, ErrorState, Skeleton } from '@/ui'
import { BytesField, useParsedBytes, type BytesState } from './BytesField'
import { DecodedResult } from './DecodedResult'
import { useDecoded } from './use-decoded'

const CONTRACT_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** The data contract and identity decoders: paste bytes, read them back as JSON. */
export function ByteDecoder({ kind, label }: { kind: 'dataContract' | 'identity'; label: string }) {
  const { t } = useLingui()
  const [state, setState] = useState<BytesState>({ text: '', choice: 'auto' })
  const parsed = useParsedBytes(state)
  const decoded = useDecoded(kind, parsed)
  return (
    <div className="grid gap-4">
      <Card title={t`Input`} layer="platform">
        <BytesField state={state} onChange={setState} parsed={parsed} label={label} />
      </Card>
      <DecodedResult state={decoded} />
    </div>
  )
}

/** A document is decoded against its contract: the contract is fetched once from the network (proof-checked) and the type picked from it. */
export function DocumentDecoder({
  contract,
  type,
}: {
  contract: string | undefined
  type: string | undefined
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const ids = { contract: useId(), custom: useId(), type: useId() }
  const known = wellKnownContracts(net)
  const [typed, setTyped] = useState<string | undefined>()
  const contractInput = typed ?? contract ?? ''
  const [state, setState] = useState<BytesState>({ text: '', choice: 'auto' })
  const parsed = useParsedBytes(state)

  const contractId = contract && CONTRACT_ID.test(contract) ? contract : undefined
  const query = useQuery({
    ...sdkQueries['contracts.serialized'](net, { id: contractId ?? '' }),
    enabled: contractId !== undefined,
  })
  const found = query.data?.data ?? undefined
  const types = found?.documentTypes ?? []
  const chosenType = type && types.includes(type) ? type : undefined
  const decoded = useDecoded(
    'document',
    parsed,
    found && chosenType ? { contract: found.bytes, type: chosenType } : undefined,
    found !== undefined && chosenType !== undefined,
  )

  const setParams = (next: { contract?: string | undefined; type?: string | undefined }) => {
    void navigate({
      to: '/tools/$decoder',
      params: { decoder: 'document' },
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...next })) as never,
      replace: true,
      resetScroll: false,
    })
  }
  const picked = known.some((c) => c.id === contractInput) ? contractInput : ''

  return (
    <div className="grid gap-4">
      <Card
        title={t`Contract and type`}
        layer="platform"
        {...(query.data ? { source: query.data } : {})}
        state={query.isFetching && !query.data ? 'loading' : 'ready'}
      >
        <div className="grid gap-3">
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`A document's bytes only mean something against its contract. Radar fetches the contract once, checks its proof here and keeps it to decode with.`}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <label htmlFor={ids.contract} className="text-sm font-medium">
                {t`Contract`}
              </label>
              <select
                id={ids.contract}
                className="dh-input"
                value={picked}
                onChange={(e) => {
                  setTyped(undefined)
                  setParams({ contract: e.target.value || undefined, type: undefined })
                }}
              >
                <option value="">{t`Another contract…`}</option>
                {known.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 flex-1 gap-1">
              <label htmlFor={ids.custom} className="text-sm font-medium">
                {t`Contract ID`}
              </label>
              <input
                id={ids.custom}
                className="dh-input rx-mono"
                autoComplete="off"
                spellCheck={false}
                value={contractInput}
                aria-invalid={
                  contractInput !== '' && !CONTRACT_ID.test(contractInput) ? true : undefined
                }
                onChange={(e) => {
                  const value = e.target.value.trim()
                  setTyped(value)
                  if (CONTRACT_ID.test(value) || value === '')
                    setParams({ contract: value || undefined, type: undefined })
                }}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor={ids.type} className="text-sm font-medium">
                {t`Document type`}
              </label>
              <select
                id={ids.type}
                className="dh-input"
                value={chosenType ?? ''}
                disabled={types.length === 0}
                onChange={(e) => {
                  setParams({ type: e.target.value || undefined })
                }}
              >
                <option value="">{t`Pick a type`}</option>
                {types.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {query.isFetching && !query.data ? <Skeleton shape="row" count={1} /> : null}
          {query.isError ? (
            <ErrorState
              error={query.error}
              source="sdk"
              onRetry={() => {
                void query.refetch()
              }}
            />
          ) : null}
          {query.data && !found ? (
            <Empty
              kind="not-found"
              title={t`No contract with this ID on this network.`}
              body={t`Check the ID, or pick one of the contracts in the list.`}
            />
          ) : null}
        </div>
      </Card>
      <Card title={t`Input`} layer="platform">
        <BytesField
          state={state}
          onChange={setState}
          parsed={parsed}
          label={t`Serialized document`}
        />
        {parsed?.ok && (!found || !chosenType) ? (
          <p className="mt-2 text-sm" data-needs-contract>
            {t`Choose the contract and the document type above to decode this document.`}
          </p>
        ) : null}
      </Card>
      <DecodedResult state={decoded} />
    </div>
  )
}
