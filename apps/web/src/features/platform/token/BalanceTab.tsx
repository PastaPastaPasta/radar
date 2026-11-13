import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkBatchers, sdkQueries } from '@/data/sdk/queries'
import { IdentityRef } from '@/features/entity'
import { Amount, Badge, Card, ErrorState, KeyValue, Skeleton } from '@/ui'
import { tokenAmountKind, type TokenView } from './use-token'
import { useWho } from './use-who'
import { WhoForm, WhoProblem } from './WhoForm'

export function BalanceTab({ token, who }: { token: TokenView; who: string | undefined }) {
  const { t } = useLingui()
  const resolved = useWho(who)
  return (
    <Card title={t`Balance`} layer="platform" id="token-balance">
      <div className="grid gap-4">
        <WhoForm who={who} />
        <WhoProblem who={resolved} />
        {resolved.state === 'resolving' ? <Skeleton shape="line" /> : null}
        {resolved.state === 'none' ? (
          <p>{t`Enter an identity ID or a DPNS name to see its balance of this token.`}</p>
        ) : null}
        {resolved.state === 'ready' ? (
          <Holding
            token={token}
            identityId={resolved.id}
            name={resolved.name}
            nameStamp={resolved.stamp}
          />
        ) : null}
      </div>
    </Card>
  )
}

function Holding({
  token,
  identityId,
  name,
  nameStamp,
}: {
  token: TokenView
  identityId: string
  name: string | undefined
  nameStamp: SourceStamp | undefined
}) {
  const { t } = useLingui()
  const { net, id } = token
  const balance = useQuery(sdkBatchers.tokenBalance.queryOptions(net, { tokenId: id, identityId }))
  const infos = useQuery(
    sdkQueries['tokens.identityTokenInfos'](net, { identityId, tokenIds: [id] }),
  )
  const kind = tokenAmountKind(token)
  if (balance.isPending) return <Skeleton shape="stat" />
  if (balance.isError && balance.data === undefined) {
    return <ErrorState error={balance.error} source="sdk" onRetry={() => void balance.refetch()} />
  }
  const frozen = infos.data?.data.get(id)?.frozen
  const stamps: SourceStamp[] = [
    ...(balance.data ? [stampOf(balance.data)] : []),
    ...(infos.data ? [stampOf(infos.data)] : []),
    ...(nameStamp ? [nameStamp] : []),
  ]
  return (
    <Card layer="platform" source={stamps} data-balance>
      <KeyValue
        columns={2}
        items={[
          {
            label: name ? t`Identity (${name})` : t`Identity`,
            value: <IdentityRef id={identityId} />,
          },
          {
            label: t`Balance`,
            value:
              kind === undefined ? (
                '—'
              ) : (
                <span data-field="token-balance">
                  <Amount value={balance.data?.data ?? 0n} kind={kind} />
                </span>
              ),
            hint:
              balance.data?.data === null ? t`This identity holds none of this token.` : undefined,
          },
          {
            label: t`Frozen`,
            value: infos.isPending ? (
              t`Loading…`
            ) : infos.isError ? (
              t`Not available right now`
            ) : frozen ? (
              <Badge tone="warning">{t`Frozen`}</Badge>
            ) : (
              t`Not frozen`
            ),
          },
        ]}
      />
    </Card>
  )
}
