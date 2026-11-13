import { useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { formatAmountText } from '@/lib/units'
import { Card, Empty, ErrorState, Skeleton } from '@/ui'
import { loadState, useSetSearch } from './common'
import { readKeyHash } from './ids'
import { keyHashMatchesQuery } from './queries'

export function IdentityLookupPage({
  pkh,
  after,
}: {
  pkh?: string | undefined
  after?: string | undefined
}) {
  const { t } = useLingui()
  const setSearch = useSetSearch()
  const [draft, setDraft] = useState(pkh ?? '')
  const [problem, setProblem] = useState<string>()

  const explain = (read: ReturnType<typeof readKeyHash>): string | undefined =>
    read.ok
      ? undefined
      : read.reason === 'empty'
        ? t`Enter a public key hash: 40 hexadecimal characters.`
        : read.reason === 'length'
          ? t`A public key hash is exactly 40 hexadecimal characters (20 bytes).`
          : t`A public key hash holds only the characters 0–9 and a–f.`

  const submit = (value: string) => {
    const read = readKeyHash(value)
    if (read.ok) {
      setProblem(undefined)
      setSearch({ pkh: read.pkh, after: undefined })
      return
    }
    setProblem(explain(read))
  }

  return (
    <PageFrame
      path="/identity/lookup"
      title={t`Identity by key hash`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Paste the HASH160 of a public key to find the identity that holds it.`}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <label className="flex flex-wrap items-center gap-2">
          <span>{t`Public key hash`}</span>
          <input
            className="dh-input rx-mono"
            style={{ minWidth: 'min(100%, 22rem)' }}
            value={draft}
            spellCheck={false}
            autoComplete="off"
            placeholder="7dc0c939f8dcc2775a4069776774c1b623eb1498"
            aria-invalid={problem ? true : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
            }}
          />
        </label>
        <button type="submit" className="dh-btn">
          {t`Find`}
        </button>
        {problem ? (
          <span role="alert" className="text-bad">
            {problem}
          </span>
        ) : null}
      </form>
      {pkh ? <Matches key={pkh} pkh={pkh} after={after} /> : null}
    </PageFrame>
  )
}

function Matches({ pkh, after }: { pkh: string; after: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const unique = useQuery(sdkQueries['identities.byPublicKeyHash'](net, { pkh }))
  const found = unique.data?.data?.id
  useEffect(() => {
    if (found === undefined) return
    void navigate({
      to: '/identity/$id',
      params: { id: found },
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        pkh: undefined,
        after: undefined,
      })) as never,
      replace: true,
    })
  }, [found, navigate])

  const shared = useInfiniteQuery({
    ...keyHashMatchesQuery(net, pkh, after),
    enabled: unique.data !== undefined && found === undefined,
  })

  if (unique.isPending) return <Skeleton shape="block" />
  if (unique.isError && unique.data === undefined) {
    return <ErrorState error={unique.error} source="sdk" onRetry={() => void unique.refetch()} />
  }
  if (found !== undefined) return <p role="status">{t`Opening the identity…`}</p>

  const pages = shared.data?.pages ?? []
  const rows = pages.flatMap((p) => p.data)
  const first = pages[0]
  return (
    <Card
      title={t`Identities holding this key hash`}
      layer="platform"
      id="identity-key-matches"
      subtitle={t`No single identity owns this hash; these identities share it.`}
      source={first ? stampOf(first) : undefined}
      state={
        rows.length === 0 && !shared.isPending && !shared.isError ? 'ready' : loadState(shared)
      }
      error={shared.error}
      onRetry={() => void shared.refetch()}
    >
      {rows.length === 0 ? (
        <Empty
          kind="no-match"
          title={t`No identity holds this key hash.`}
          body={t`Check that it is the HASH160 of the public key, on this network.`}
        />
      ) : (
        <>
          <ul className="grid gap-2" data-matches>
            {rows.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3">
                <IdentityRef id={i.id} />
                <span className="rx-num">{formatAmountText(i.balance, 'credits')}</span>
              </li>
            ))}
          </ul>
          {shared.hasNextPage ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm justify-self-start"
              disabled={shared.isFetchingNextPage}
              onClick={() => void shared.fetchNextPage()}
            >
              {t`Load more`}
            </button>
          ) : (
            <p className="rx-dim">{t`That is every match.`}</p>
          )}
        </>
      )}
    </Card>
  )
}
