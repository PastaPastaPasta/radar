import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import {
  IdentityRef,
  PageFrame,
  PageLink,
  recordViewedIdentity,
  SaveButton,
  useIdentityName,
  useNetwork,
} from '@/features/entity'
import { isDevnet, type NetworkId } from '@/lib/network'
import { Empty, ErrorState, Hash, LinkOut, Skeleton, Tabs } from '@/ui'
import { AdvancedTab } from './AdvancedTab'
import { GroupsTab } from './GroupsTab'
import { HistoryTab } from './HistoryTabs'
import { IDENTITY_TABS, readIdentityInput, type IdentityTab } from './ids'
import { KeysTab } from './KeysTab'
import { NamesTab } from './NamesTab'
import { OverviewTab } from './OverviewTab'
import { TokensTab } from './TokensTab'
import { VotesTab } from './VotesTab'

export interface IdentityPageSearch {
  tab: IdentityTab
  page: number
  contract?: string | undefined
  type?: string | undefined
  tokens?: string[] | undefined
}

const otherNetwork = (net: NetworkId): NetworkId => (net === 'mainnet' ? 'testnet' : 'mainnet')

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

  if (input.kind === 'invalid') {
    return (
      <PageFrame
        path="/identity/$id"
        title={t`Identity`}
        eyebrow={t`Platform`}
        layer="platform"
        share
      >
        <Empty
          kind="not-found"
          title={t`That isn’t an identity ID.`}
          body={t`An identity ID is 43 or 44 base58 characters, or 64 hexadecimal characters.`}
          action={<PageLink to="/identity/lookup">{t`Find an identity by key hash`}</PageLink>}
        />
      </PageFrame>
    )
  }
  if (input.kind === 'hex') {
    return (
      <PageFrame
        path="/identity/$id"
        title={t`Identity`}
        eyebrow={t`Platform`}
        layer="platform"
        share
      >
        <Skeleton shape="block" />
      </PageFrame>
    )
  }
  return <IdentityView id={input.id} search={search} />
}

function IdentityView({ id, search }: { id: string; search: IdentityPageSearch }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const name = useIdentityName(id)
  const exists = useQuery(sdkQueries['identities.balanceAndRevision'](net, { id }))
  useEffect(() => {
    recordViewedIdentity(net, id)
  }, [net, id])

  const missing = exists.data !== undefined && exists.data.data === null
  const other = otherNetwork(net)

  return (
    <PageFrame
      path="/identity/$id"
      title={t`Identity`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={<IdentityRef id={id} />}
      actions={
        <>
          <SaveButton kind="identity" id={id} label={name} />
          <LinkOut
            to={{ app: 'bridge', action: 'identity', id, net }}
          >{t`Manage in Bridge`}</LinkOut>
        </>
      }
    >
      <Hash value={id} display="wrap" />
      {missing ? (
        <Empty
          kind="not-found"
          title={t`No identity with this ID on ${net}.`}
          body={t`Platform has no identity with this ID on this network.`}
          action={
            isDevnet(net) ? undefined : (
              <PageLink to={`/identity/${encodeURIComponent(id)}`} search={{ network: other }}>
                {t`Search on ${other}`}
              </PageLink>
            )
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
                  })) as never,
                }) as never
              }
            />
          </div>
          {exists.isError && exists.data === undefined ? (
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
      return <HistoryTab id={id} tab={search.tab} page={search.page} type={search.type} />
  }
}
