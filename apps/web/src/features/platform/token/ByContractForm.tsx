import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'

const POSITION = /^\d{1,5}$/

/** Opens a token from the contract that defines it and its position there: the ID is computed locally. */
export function ByContractForm({
  contract = '',
  position = '',
}: {
  contract?: string
  position?: string
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [contractId, setContractId] = useState(contract)
  const [pos, setPos] = useState(position)
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      data-by-contract
      onSubmit={(e) => {
        e.preventDefault()
        const c = contractId.trim()
        const p = pos.trim()
        if (!isPlatformId(c)) {
          setProblem(t`That isn’t a contract ID: it is 43 or 44 base58 characters.`)
          return
        }
        if (!POSITION.test(p) || Number(p) > 65_535) {
          setProblem(t`The position is a whole number from 0 to 65535.`)
          return
        }
        setProblem(undefined)
        setBusy(true)
        qc.fetchQuery(sdkQueries['tokens.calculateId'](net, { contractId: c, position: Number(p) }))
          .then((answer) => navigate({ to: '/token/$id', params: { id: answer.data } }))
          .catch(() => {
            setProblem(t`The token ID could not be worked out.`)
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      <label className="grid gap-1">
        <span>{t`Contract ID`}</span>
        <input
          className="dh-input dh-input--sm"
          style={{ width: 'min(100%, 24rem)' }}
          value={contractId}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setContractId(e.target.value)
          }}
        />
      </label>
      <label className="grid gap-1">
        <span>{t`Position`}</span>
        <input
          className="dh-input dh-input--sm"
          style={{ width: '6rem' }}
          inputMode="numeric"
          value={pos}
          autoComplete="off"
          onChange={(e) => {
            setPos(e.target.value)
          }}
        />
      </label>
      <button type="submit" className="dh-btn dh-btn--sm" disabled={busy}>
        {t`Open token`}
      </button>
      {problem ? (
        <span role="alert" className="basis-full text-bad">
          {problem}
        </span>
      ) : null}
    </form>
  )
}
