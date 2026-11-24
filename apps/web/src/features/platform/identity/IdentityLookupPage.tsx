import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import {
  cursorPosition,
  IdentityRef,
  PageFrame,
  ScrollList,
  useNetwork,
  usePageChain,
} from '@/features/entity'
import { formatAmountText } from '@/lib/units'
import { Card, Empty, ErrorState, Pager, Skeleton } from '@/ui'
import { useSetSearch } from './common'
import { readKeyHash } from './ids'
import { keyHashMatchesPage } from './queries'

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

  const submit = (value: string) => {
    const read = readKeyHash(value)
    if (read.ok) {
      setProblem(undefined)
      setSearch({ pkh: read.pkh, after: undefined })
      return
    }
    setSearch({ pkh: undefined, after: undefined })
    setProblem(
      read.reason === 'empty'
        ? t`Enter a public key hash: 40 hexadecimal characters.`
        : read.reason === 'length'
          ? t`A public key hash is exactly 40 hexadecimal characters (20 bytes).`
          : t`A public key hash holds only the characters 0–9 and a–f.`,
    )
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

  const shared = usePageChain({
    listKey: pkh,
    start: after,
    query: (cursor: string | undefined) => keyHashMatchesPage(net, pkh, cursor),
    rows: (p) => p.data,
    getRowId: (i) => i.id,
    next: (p) => p.data.at(-1)?.id,
    enabled: unique.data !== undefined && found === undefined,
  })

  if (unique.isPending) return <Skeleton shape="block" />
  if (unique.isError && unique.data === undefined) {
    return <ErrorState error={unique.error} source="sdk" onRetry={() => void unique.refetch()} />
  }
  if (found !== undefined) return <p role="status">{t`Opening the identity…`}</p>

  const { rows } = shared
  const first = shared.pages.find((p) => p.data)?.data
  return (
    <Card
      title={t`Identities holding this key hash`}
      layer="platform"
      id="identity-key-matches"
      subtitle={t`No single identity owns this hash; these identities share it.`}
      source={first ? stampOf(first) : undefined}
      state={shared.state === 'empty' ? 'ready' : shared.state}
      error={shared.error}
      onRetry={shared.onRetry}
    >
      {rows.length === 0 ? (
        <Empty
          kind="no-match"
          title={t`No identity holds this key hash.`}
          body={t`Check that it is the HASH160 of the public key, on this network.`}
        />
      ) : (
        <ScrollList chain={shared} position={cursorPosition('after')}>
          <ul className="grid gap-2" data-matches>
            {rows.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3" data-row-id={i.id}>
                <IdentityRef id={i.id} />
                <span className="rx-num">{formatAmountText(i.balance, 'credits')}</span>
              </li>
            ))}
          </ul>
          {shared.paging.hasNext ? (
            <div className="rx-tfoot">
              <Pager paging={shared.paging} shown={rows.length} />
            </div>
          ) : (
            <p className="rx-dim">{t`That is every match.`}</p>
          )}
        </ScrollList>
      )}
    </Card>
  )
}
