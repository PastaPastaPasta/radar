import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { PageFrame, PageLink, TransitionTable, useNetwork } from '@/features/entity'
import { decodePlatformAddress, PLATFORM_HRP } from '@/lib/bech32'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Amount,
  Card,
  Empty,
  ErrorState,
  Hash,
  KeyValue,
  LinkOut,
  Skeleton,
  Unavailable,
} from '@/ui'
import { loadState, PE_PAGE, pageTo, peChildQuery } from '../identity/common'

export function PlatformAddressPage({ addr, page = 1 }: { addr: string; page?: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const parts = decodePlatformAddress(addr)
  const expected = isDevnet(net) ? undefined : PLATFORM_HRP[net]
  const wrongNetwork = parts !== null && expected !== undefined && parts.hrp !== expected
  const other = parts?.hrp === 'tdash' ? 'testnet' : 'mainnet'

  return (
    <PageFrame
      path="/platform-address/$addr"
      title={t`Platform address`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      actions={
        parts && !wrongNetwork ? (
          <LinkOut to={{ app: 'bridge', action: 'platform-address', id: addr, net }}>
            {t`Manage in Bridge`}
          </LinkOut>
        ) : undefined
      }
      lede={parts && !wrongNetwork ? <Hash value={addr} display="wrap" /> : undefined}
    >
      {parts === null ? (
        <Card layer="platform">
          <Empty
            kind="not-found"
            title={t`That isn’t a Platform address.`}
            body={t`A Platform address is written in bech32m and starts with dash1 on mainnet or tdash1 on testnet. It is not a Core address, which starts with X, 7 or y.`}
          />
        </Card>
      ) : wrongNetwork ? (
        <Card layer="platform">
          <Empty
            kind="not-found"
            title={t`This is a ${other} address.`}
            body={t`Its prefix belongs to ${other}, so it cannot exist on this network.`}
            action={
              <PageLink
                to={`/platform-address/${encodeURIComponent(addr)}`}
                search={{ network: other }}
              >
                {t`Open it on ${other}`}
              </PageLink>
            }
          />
        </Card>
      ) : (
        <AddressView addr={addr} page={page} />
      )}
    </PageFrame>
  )
}

function AddressView({ addr, page }: { addr: string; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const state = useQuery(sdkQueries['addresses.get'](net, { address: addr }))
  const indexed = useQuery({
    ...peQueries.platformAddress(net, addr),
    enabled: !decentralized && !isDevnet(net),
  })

  if (state.isPending) return <Skeleton shape="block" />
  if (state.isError && state.data === undefined) {
    return <ErrorState error={state.error} source="sdk" onRetry={() => void state.refetch()} />
  }
  const found = state.data?.data ?? null
  const totals = indexed.data?.data ?? null
  const stamps: SourceStamp[] = [
    ...(state.data ? [stampOf(state.data)] : []),
    ...(indexed.data ? [stampOf(indexed.data)] : []),
  ]

  return (
    <div className="grid gap-6">
      <Card title={t`Balance and nonce`} layer="platform" id="paddr-summary" source={stamps}>
        {found ? (
          <KeyValue
            columns={2}
            items={[
              {
                label: t`Balance`,
                value: (
                  <span data-paddr-balance>
                    <Amount value={found.balance} kind="credits" fiat />
                  </span>
                ),
                hint: t`${formatInt(found.balance)} credits`,
              },
              { label: t`Nonce`, value: formatInt(found.nonce) },
              ...(totals
                ? [
                    { label: t`Transitions`, value: formatInt(totals.totalTxs ?? 0) },
                    {
                      label: t`Received`,
                      value:
                        totals.totalIncomingAmount == null ? (
                          '—'
                        ) : (
                          <Amount value={totals.totalIncomingAmount} kind="credits" />
                        ),
                      hint: t`${formatInt(totals.incomingTxs ?? 0)} incoming`,
                    },
                    {
                      label: t`Sent`,
                      value:
                        totals.totalOutgoingAmount == null ? (
                          '—'
                        ) : (
                          <Amount value={totals.totalOutgoingAmount} kind="credits" />
                        ),
                      hint: t`${formatInt(totals.outgoingTxs ?? 0)} outgoing`,
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <Empty
            kind="none-yet"
            title={t`This address holds nothing on ${net}.`}
            body={t`Platform has no balance for it. An address appears when someone sends it credits.`}
          />
        )}
      </Card>
      <Transitions addr={addr} page={page} />
    </div>
  )
}

function Transitions({ addr, page }: { addr: string; page: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const q = useQuery({
    ...peQueries.platformAddressTransitions(net, addr, peChildQuery(page)),
    enabled: !decentralized && !isDevnet(net),
  })
  if (decentralized) {
    return (
      <Unavailable
        source="pe"
        title={t`An address’s transitions need an indexer; Platform keeps no history per address`}
      />
    )
  }
  if (isDevnet(net)) {
    return <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
  }
  return (
    <Card
      title={t`Transitions`}
      layer="platform"
      id="paddr-transitions"
      source={q.data ? stampOf(q.data) : undefined}
    >
      <TransitionTable
        rows={q.data?.data.items ?? []}
        state={loadState(q)}
        error={q.error}
        onRetry={() => void q.refetch()}
        caption={t`Transitions of this address`}
        columns={['type', 'hash', 'status', 'block', 'gas', 'time']}
        paging={{ kind: 'page', page, limit: PE_PAGE, total: q.data?.data.total, to: pageTo }}
        empty={<Empty kind="none-yet" title={t`No transitions involve this address.`} />}
      />
    </Card>
  )
}
