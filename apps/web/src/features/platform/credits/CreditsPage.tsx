import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useDecentralizedOnly } from '@/data/health'
import { sdkQueries } from '@/data/sdk/queries'
import { PageFrame, PageGroupTabs, useNetwork } from '@/features/entity'
import { base58Encode, isPlatformId } from '@/lib/base58'
import { hexToBytes, isHex, normalizeHex } from '@/lib/hex'
import {
  Amount,
  Card,
  Copy,
  Empty,
  ErrorState,
  Skeleton,
  Stat,
  Stats,
  queryView,
  stampsOf,
  useAfterIdle,
} from '@/ui'
import { useLookupForm } from '../quorums/lookup-form'

const NONE = {} as const

/** An id typed as base58 or as 64 hex characters, in base58; `undefined` when it is neither. */
export function parseCreditId(input: string): string | undefined {
  const text = input.trim()
  if (isPlatformId(text)) return text
  const hex = normalizeHex(text)
  return isHex(hex, 32) ? base58Encode(hexToBytes(hex)) : undefined
}

/** NX-57: the credits held in Platform, and a lookup of one prefunded specialised balance. */
export function CreditsPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const { id } = useSearch({ from: '/credits' })
  const ready = useAfterIdle()
  const total = useQuery({ ...sdkQueries['system.totalCredits'](net, NONE), enabled: ready })
  return (
    <PageFrame
      path="/credits"
      title={t`Credits`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`The credits held in Platform, and a lookup of a prefunded specialised balance by its ID.`}
    >
      <PageGroupTabs group="chain" />
      <Card
        id="total-credits"
        layer="platform"
        title={t`Total credits`}
        subtitle={t`Every credit in Platform: identity balances, prefunded balances and fees yet to be paid out.`}
        source={stampsOf(total.data)}
        {...queryView(total)}
      >
        {total.data ? (
          total.data.data === null ? (
            <Empty kind="none-yet" title={t`Platform reports no credits.`} />
          ) : (
            <Stats>
              <Stat
                label={t`In Platform`}
                value={<Amount value={total.data.data} kind="credits" fiat={!off} />}
                note={t`${total.data.data.toLocaleString()} credits`}
                size="lg"
                layer="platform"
              />
            </Stats>
          )
        ) : null}
      </Card>
      <Lookup id={id} off={off} />
    </PageFrame>
  )
}

function Lookup({ id, off }: { id: string | undefined; off: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const { draft, setDraft, submit } = useLookupForm('/credits', 'id', id)
  const parsed = id === undefined ? undefined : parseCreditId(id)
  const balance = useQuery({
    ...sdkQueries['system.prefundedSpecializedBalance'](net, { id: parsed ?? '' }),
    enabled: parsed !== undefined,
  })
  const invalid = id !== undefined && parsed === undefined
  return (
    <Card
      id="prefunded"
      layer="platform"
      title={t`Prefunded specialised balance`}
      subtitle={t`Credits set aside for one purpose, such as the vote on a contested name. Look one up by its ID.`}
      source={stampsOf(balance.data)}
    >
      <div className="grid grid-cols-1 gap-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          <label className="rx-grow grid gap-1 text-sm">
            <span>{t`Balance ID`}</span>
            <input
              className="dh-input"
              name="id"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder={t`Base58 or 64 hex characters`}
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
            title={t`That is not a valid ID`}
            body={t`An ID is 32 bytes: a base58 string of 43 or 44 characters, or 64 hex characters.`}
          />
        ) : parsed === undefined ? null : balance.isError && balance.data === undefined ? (
          <ErrorState
            error={balance.error}
            onRetry={() => {
              void balance.refetch()
            }}
          />
        ) : balance.data === undefined ? (
          <Skeleton shape="block" />
        ) : balance.data.data === null ? (
          <Empty
            kind="none-yet"
            title={t`No prefunded balance`}
            body={t`Platform holds no prefunded specialised balance under this ID.`}
          />
        ) : (
          <div data-prefunded-balance>
            <Stats>
              <Stat
                label={t`Balance`}
                value={<Amount value={balance.data.data.balance} kind="credits" fiat={!off} />}
                layer="platform"
              />
            </Stats>
            <p className="mt-2 flex items-center gap-1 text-sm">
              <code>{balance.data.data.id}</code>
              <Copy value={balance.data.data.id} label={t`Copy ID`} />
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
