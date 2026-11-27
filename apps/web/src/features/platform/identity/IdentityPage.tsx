import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { isOutage } from '@/data/errors'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import {
  PageFrame,
  PageLink,
  recordViewedIdentity,
  SaveButton,
  useIdentityName,
  useNetwork,
} from '@/features/entity'
import { stampOf } from '@/data/envelope'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Amount, Empty, ErrorState, LinkOut, Skeleton, Stat, Tabs } from '@/ui'
import { AdvancedTab } from './AdvancedTab'
import { GroupsTab } from './GroupsTab'
import { HistoryTab } from './HistoryTabs'
import { IDENTITY_TABS, readIdentityInput, type IdentityTab } from './ids'
import { KeysTab } from './KeysTab'
import { NamesTab } from './NamesTab'
import { OverviewTab } from './OverviewTab'
import { TokensTab } from './TokensTab'
import { VotesTab } from './VotesTab'
import { TX_FILTER_KEYS, type IdentityTxFilters } from './tx-filters'

export interface IdentityPageSearch {
  tab: IdentityTab
  page: number
  contract?: string | undefined
  type?: string | undefined
  tokens?: string[] | undefined
  txtype?: IdentityTxFilters['txtype']
  batch?: string[] | undefined
  status?: IdentityTxFilters['status']
  gas?: IdentityTxFilters['gas']
  from?: string | undefined
  to?: string | undefined
}

export function IdentityPage({ id: raw, search }: { id: string; search: IdentityPageSearch }) {
  const { t } = useLingui()
  const input = readIdentityInput(raw)
  const navigate = useNavigate()
  const hexTarget = input.kind === 'hex' ? input.id : undefined
  useEffect(() => {
    if (hexTarget === undefined) return
    void navigate({
      to: '/identity/$id',
      params: { id: hexTarget },
      search: ((prev: Record<string, unknown>) => prev) as never,
      replace: true,
    })
  }, [hexTarget, navigate])

  const frame = (body: ReactNode) => (
    <PageFrame
      path="/identity/$id"
      title={t`Identity`}
      eyebrow={t`Platform`}
      layer="platform"
      share
    >
      {body}
    </PageFrame>
  )
  if (input.kind === 'invalid') {
    return frame(
      <Empty
        kind="not-found"
        title={t`That isn’t an identity ID.`}
        body={t`An identity ID is 43 or 44 base58 characters, or 64 hexadecimal characters.`}
        action={<PageLink to="/identity/lookup">{t`Find an identity by key hash`}</PageLink>}
      />,
    )
  }
  if (input.kind === 'hex') return frame(<Skeleton shape="block" />)
  return <IdentityView id={input.id} search={search} />
}

function IdentityView({ id, search }: { id: string; search: IdentityPageSearch }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const name = useIdentityName(id)
  const exists = useQuery(sdkQueries['identities.balanceAndRevision'](net, { id }))
  const sdkFailed = exists.isError && exists.data === undefined
  const decentralized = useDecentralizedOnly()
  // Only an outage turns to the index: a proof that failed, or an answer Radar couldn't read, is shown as it is (§2.3).
  const askIndex = sdkFailed && isOutage(exists.error) && !decentralized
  const indexed = useQuery({ ...peQueries.identity(net, id), enabled: askIndex })
  useEffect(() => {
    recordViewedIdentity(net, id)
  }, [net, id])

  const missing = exists.data?.data === null
  const unindexed = askIndex && indexed.data?.data === null
  const other = net === 'mainnet' ? 'testnet' : 'mainnet'
  const found = exists.data?.data
  const stamp = exists.data ? stampOf(exists.data) : undefined
  const otherNetLink = isDevnet(net) ? undefined : (
    <PageLink to={`/identity/${encodeURIComponent(id)}`} search={{ network: other }}>
      {t`Search on ${other}`}
    </PageLink>
  )

  return (
    <PageFrame
      path="/identity/$id"
      title={t`Identity`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      record={{
        kind: 'identity',
        id,
        name,
        facts: found ? (
          <>
            <Stat
              label={t`Balance`}
              value={
                <span data-field="balance">
                  <Amount value={found.balance} kind="credits" fiat />
                </span>
              }
              note={t`${formatInt(found.balance)} credits`}
              source={stamp}
            />
            <Stat label={t`Revision`} value={formatInt(found.revision)} source={stamp} />
          </>
        ) : undefined,
      }}
      actions={
        <>
          <SaveButton kind="identity" id={id} label={name} />
          <LinkOut
            to={{ app: 'bridge', action: 'identity', id, net }}
          >{t`Manage in Bridge`}</LinkOut>
        </>
      }
    >
      {missing ? (
        <Empty
          kind="not-found"
          title={t`No identity with this ID on ${net}.`}
          body={t`Platform has no identity with this ID on this network.`}
          source={stamp}
          action={otherNetLink}
        />
      ) : unindexed ? (
        <Empty
          kind="not-found"
          title={t`Platform Explorer has no identity with this ID on ${net}.`}
          body={t`DAPI isn’t answering, so Radar couldn’t confirm it with a proof. The ID may be new, mistyped, or on another network.`}
          source={indexed.data ? stampOf(indexed.data) : undefined}
          action={
            <div className="grid justify-items-center gap-3">
              <button
                type="button"
                className="dh-btn dh-btn--sm"
                onClick={() => void exists.refetch()}
              >
                {t`Check with DAPI again`}
              </button>
              {otherNetLink}
            </div>
          }
        />
      ) : (
        <>
          <div className="min-w-0">
            <Tabs
              layer="platform"
              value={search.tab}
              tabs={IDENTITY_TABS.map((tab) => ({ id: tab, label: i18n._(TAB_LABELS[tab]) }))}
              to={(tab) =>
                ({
                  to: '.',
                  search: ((prev: Record<string, unknown>) => ({
                    ...prev,
                    tab: tab === 'overview' ? undefined : tab,
                    page: undefined,
                    type: tab === 'documents' ? prev.type : undefined,
                    ...(tab === 'transactions' ? {} : leaveTransitions(tab)),
                  })) as never,
                }) as never
              }
            />
          </div>
          {sdkFailed ? (
            <ErrorState error={exists.error} source="sdk" onRetry={() => void exists.refetch()} />
          ) : null}
          <TabBody id={id} search={search} />
        </>
      )}
    </PageFrame>
  )
}

const TAB_LABELS: Record<IdentityTab, MessageDescriptor> = {
  overview: msg`Overview`,
  keys: msg`Keys`,
  names: msg`Names`,
  tokens: msg`Tokens`,
  groups: msg`Groups`,
  votes: msg`Votes`,
  advanced: msg`Advanced`,
  transactions: msg`Transitions`,
  contracts: msg`Contracts`,
  documents: msg`Documents`,
  transfers: msg`Transfers`,
}

function TabBody({ id, search }: { id: string; search: IdentityPageSearch }) {
  switch (search.tab) {
    case 'overview':
      return <OverviewTab id={id} />
    case 'keys':
      return <KeysTab id={id} />
    case 'names':
      return <NamesTab id={id} />
    case 'tokens':
      return <TokensTab id={id} tokens={search.tokens ?? []} />
    case 'groups':
      return <GroupsTab id={id} contract={search.contract} />
    case 'votes':
      return <VotesTab id={id} />
    case 'advanced':
      return <AdvancedTab id={id} contract={search.contract} />
    case 'transactions':
    case 'contracts':
    case 'documents':
    case 'transfers':
      return (
        <HistoryTab
          id={id}
          tab={search.tab}
          page={search.page}
          type={search.type}
          filters={search}
        />
      )
  }
}

/** The Transitions tab's filters end with it; Groups and Advanced read `contract` too, so it stays for them. */
function leaveTransitions(tab: string): Record<string, undefined> {
  const keep = tab === 'groups' || tab === 'advanced' ? ['contract'] : []
  return Object.fromEntries(
    TX_FILTER_KEYS.filter((k) => !keep.includes(k)).map((k) => [k, undefined]),
  )
}
