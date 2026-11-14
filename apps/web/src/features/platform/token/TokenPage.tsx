import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { PageFrame, PageLink, SaveButton } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Amount, Card, Empty, ErrorState, LinkOut, Skeleton, Stat, Tabs } from '@/ui'
import { BalanceTab } from './BalanceTab'
import { ByContractForm } from './ByContractForm'
import { DefinitionTab } from './DefinitionTab'
import { DistributionTab } from './DistributionTab'
import { OverviewTab } from './OverviewTab'
import { IndexedTab } from './PeTabs'
import { supplyOf } from './token-config'
import { tokenAmountKind, useToken, type TokenView } from './use-token'

export const TOKEN_TABS = [
  'overview',
  'definition',
  'distribution',
  'balance',
  'activity',
  'holders',
] as const
export type TokenTab = (typeof TOKEN_TABS)[number]

export interface TokenPageSearch {
  tab: TokenTab
  who?: string | undefined
  page: number
}

const TAB_LABELS: Record<TokenTab, MessageDescriptor> = {
  overview: msg`Overview`,
  definition: msg`Definition`,
  distribution: msg`Distribution`,
  balance: msg`Balance`,
  activity: msg`Activity`,
  holders: msg`Holders`,
}

export function TokenPage({ id, search }: { id: string; search: TokenPageSearch }) {
  const { t, i18n } = useLingui()
  const token = useToken(id)
  const { net } = token
  const other = net === 'mainnet' ? 'testnet' : 'mainnet'
  const label = token.name?.singular
  const ready = token.valid && !token.missing
  const supply = useQuery({
    ...sdkQueries['tokens.totalSupply'](net, { tokenId: id }),
    enabled: ready,
  })
  const kind = tokenAmountKind(token)
  const max = token.config ? supplyOf(token.config, 'maxSupply') : undefined
  const plural =
    token.name && token.name.plural !== token.name.singular ? token.name.plural : undefined

  const frame = (body: ReactNode) => (
    <PageFrame
      path="/token/$id"
      title={t`Token`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      {...(token.valid
        ? {
            record: {
              kind: 'token' as const,
              id,
              name: label,
              facts:
                ready && supply.data && kind ? (
                  <>
                    <Stat
                      label={t`Total supply`}
                      value={
                        <span data-token-supply>
                          <Amount value={supply.data.data ?? 0n} kind={kind} />
                        </span>
                      }
                      note={
                        max !== undefined ? (
                          <>
                            {t`Maximum`} <Amount value={max} kind={kind} />
                          </>
                        ) : undefined
                      }
                      source={stampOf(supply.data)}
                    />
                    {token.decimals === undefined ? null : (
                      <Stat label={t`Decimals`} value={formatInt(token.decimals)} />
                    )}
                  </>
                ) : undefined,
            },
          }
        : {})}
      lede={ready && plural ? <span data-token-plural>{plural}</span> : undefined}
      actions={
        ready ? (
          <>
            <SaveButton kind="token" id={id} label={label} />
            <LinkOut
              to={{ app: 'bridge', action: 'token', id, net }}
            >{t`Manage in Bridge`}</LinkOut>
          </>
        ) : undefined
      }
    >
      {body}
    </PageFrame>
  )

  if (!token.valid) {
    return frame(
      <Card layer="platform">
        <Empty
          kind="not-found"
          title={t`That isn’t a token ID.`}
          body={t`A token ID is 43 or 44 base58 characters. To open a token from its contract, give the contract and the token's position in it.`}
          action={<ByContractForm />}
        />
      </Card>,
    )
  }
  if (token.missing) {
    return frame(
      <Card layer="platform" source={token.stamps}>
        <Empty
          kind="not-found"
          title={t`No token with this ID on ${net}.`}
          body={t`Platform has no token with this ID on this network. A token's ID comes from its contract and position.`}
          action={
            <div className="grid justify-items-center gap-3">
              <ByContractForm />
              {isDevnet(net) ? null : (
                <PageLink to={`/token/${encodeURIComponent(id)}`} search={{ network: other }}>
                  {t`Search on ${other}`}
                </PageLink>
              )}
            </div>
          }
        />
      </Card>,
    )
  }
  return frame(
    <>
      <div className="min-w-0">
        <Tabs
          layer="platform"
          value={search.tab}
          tabs={TOKEN_TABS.map((tab) => ({ id: tab, label: i18n._(TAB_LABELS[tab]) }))}
          to={(tab) =>
            ({
              to: '.',
              search: ((prev: Record<string, unknown>) => ({
                ...prev,
                tab: tab === 'overview' ? undefined : tab,
                page: undefined,
              })) as never,
            }) as never
          }
        />
      </div>
      {token.info.isError && token.info.data === undefined ? (
        <ErrorState
          error={token.info.error}
          source="sdk"
          onRetry={() => void token.info.refetch()}
        />
      ) : token.info.isPending ? (
        <Skeleton shape="block" />
      ) : (
        <TabBody token={token} search={search} />
      )}
    </>,
  )
}

function TabBody({ token, search }: { token: TokenView; search: TokenPageSearch }) {
  switch (search.tab) {
    case 'overview':
      return <OverviewTab token={token} />
    case 'definition':
      return <DefinitionTab token={token} />
    case 'distribution':
      return <DistributionTab token={token} who={search.who} />
    case 'balance':
      return <BalanceTab token={token} who={search.who} />
    case 'activity':
    case 'holders':
      return <IndexedTab token={token} tab={search.tab} page={search.page} />
  }
}
