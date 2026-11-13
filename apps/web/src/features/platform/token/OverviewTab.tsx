import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import { sdkBatchers, sdkQueries } from '@/data/sdk/queries'
import { Entity, PageLink } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { formatInt } from '@/lib/format'
import { Amount, Badge, Card, Empty, KeyValue, Unavailable } from '@/ui'
import { loadState } from '../identity/common'
import { ByContractForm } from './ByContractForm'
import { supplyOf } from './token-config'
import { tokenAmountKind, type TokenView } from './use-token'

export function OverviewTab({ token }: { token: TokenView }) {
  const { t } = useLingui()
  const { id, net, origin, config } = token
  const supply = useQuery(sdkQueries['tokens.totalSupply'](net, { tokenId: id }))
  const status = useQuery(sdkBatchers.tokenStatus.queryOptions(net, id))
  const price = useQuery(sdkQueries['tokens.directPurchasePrices'](net, { tokenIds: [id] }))
  const kind = tokenAmountKind(token)
  const max = config ? supplyOf(config, 'maxSupply') : undefined
  const stamps: SourceStamp[] = [
    ...token.stamps,
    ...(supply.data ? [stampOf(supply.data)] : []),
    ...(status.data ? [stampOf(status.data)] : []),
    ...(price.data ? [stampOf(price.data)] : []),
  ]
  const priceOf = price.data?.data.get(id) ?? null

  return (
    <div className="grid gap-6">
      <Card
        title={t`Summary`}
        layer="platform"
        id="token-summary"
        source={stamps}
        state={loadState(supply)}
        error={supply.error}
        onRetry={() => void supply.refetch()}
      >
        <KeyValue
          columns={2}
          items={[
            {
              label: t`Total supply`,
              value:
                supply.data && kind ? (
                  <span data-token-supply>
                    <Amount value={supply.data.data ?? 0n} kind={kind} />
                  </span>
                ) : (
                  '—'
                ),
              hint:
                max !== undefined && kind ? (
                  <span>
                    {t`Maximum`} <Amount value={max} kind={kind} />
                  </span>
                ) : undefined,
            },
            {
              label: t`Direct purchase price`,
              value: price.isPending ? (
                t`Loading…`
              ) : price.isError ? (
                t`Not available right now`
              ) : priceOf ? (
                <Amount value={priceOf.currentPrice} kind="credits" fiat />
              ) : (
                t`Not for sale`
              ),
              hint:
                priceOf && priceOf.basePrice !== priceOf.currentPrice
                  ? t`Base price ${formatInt(priceOf.basePrice)} credits`
                  : undefined,
            },
            {
              label: t`Status`,
              value: status.isPending ? (
                t`Loading…`
              ) : status.isError ? (
                t`Not available right now`
              ) : status.data?.data?.paused ? (
                <Badge tone="warning">{t`Paused`}</Badge>
              ) : (
                <Badge tone="success">{t`Active`}</Badge>
              ),
            },
            {
              label: t`Decimals`,
              value: token.decimals === undefined ? '—' : formatInt(token.decimals),
            },
            {
              label: t`Defined by contract`,
              value: origin ? (
                <Entity kind="contract" id={origin.contractId} search={{ tab: 'tokens' }} />
              ) : (
                '—'
              ),
            },
            {
              label: t`Position in the contract`,
              value: origin ? (
                <PageLink to={`/contract/${origin.contractId}`} search={{ tab: 'tokens' }}>
                  {formatInt(origin.position)}
                </PageLink>
              ) : (
                '—'
              ),
            },
          ]}
        />
      </Card>
      <ActivityNote token={token} />
      <Card title={t`Open another token by contract and position`} layer="platform">
        <ByContractForm
          contract={origin?.contractId}
          position={origin ? String(origin.position) : ''}
        />
      </Card>
    </div>
  )
}

/** Holders and activity come from Platform Explorer's index, which Decentralized only mode keeps off. */
function ActivityNote({ token }: { token: TokenView }) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  const indexed = useQuery({
    ...peQueries.token(token.net, token.id),
    enabled: !decentralized && !isDevnet(token.net),
  })
  if (decentralized) {
    return (
      <Card title={t`Holders and activity`} layer="platform" id="token-activity-note">
        <Unavailable
          source="pe"
          title={t`Platform keeps no list of a token's holders or transfers; this needs Platform Explorer's index`}
        />
      </Card>
    )
  }
  if (isDevnet(token.net)) {
    return (
      <Card title={t`Holders and activity`} layer="platform" id="token-activity-note">
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      </Card>
    )
  }
  const count = indexed.data?.data?.totalTransitionsCount
  return (
    <Card
      title={t`Holders and activity`}
      layer="platform"
      id="token-activity-note"
      source={indexed.data ? stampOf(indexed.data) : undefined}
      state={loadState(indexed)}
      error={indexed.error}
      onRetry={() => void indexed.refetch()}
    >
      <KeyValue
        items={[
          {
            label: t`Transitions recorded`,
            value: count === undefined || count === null ? '—' : formatInt(count),
            hint: (
              <>
                <PageLink to={`/token/${token.id}`} search={{ tab: 'activity' }}>
                  {t`See the activity`}
                </PageLink>
                {' · '}
                <PageLink to={`/token/${token.id}`} search={{ tab: 'holders' }}>
                  {t`See the holders`}
                </PageLink>
              </>
            ),
          },
        ]}
      />
    </Card>
  )
}
