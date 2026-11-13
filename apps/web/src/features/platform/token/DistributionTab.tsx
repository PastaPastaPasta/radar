import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import type { RewardMomentDto } from '@/data/sdk/methods/p-token'
import { sdkQueries } from '@/data/sdk/queries'
import { IdentityRef } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, Empty, ErrorState, JsonView, KeyValue, Skeleton, Time } from '@/ui'
import { distributionOf } from './token-config'
import type { TokenView } from './use-token'
import { useWho } from './use-who'
import { WhoForm, WhoProblem } from './WhoForm'

export function DistributionTab({ token, who }: { token: TokenView; who: string | undefined }) {
  const { t } = useLingui()
  const { config, contract } = token
  if (!config) {
    return (
      <Card
        title={t`Distribution`}
        layer="platform"
        id="token-distribution"
        state={contract.isError ? 'error' : 'loading'}
        error={contract.error}
        onRetry={() => void contract.refetch()}
      >
        <Skeleton shape="block" />
      </Card>
    )
  }
  const view = distributionOf(config)
  const source = contract.data ? stampOf(contract.data) : undefined
  return (
    <div className="grid gap-6">
      <Card title={t`Distribution`} layer="platform" id="token-distribution" source={source}>
        <KeyValue
          columns={2}
          items={[
            {
              label: t`Perpetual distribution`,
              value: view.perpetual ? (view.perpetualKind ?? t`Configured`) : t`None`,
            },
            {
              label: t`Pre-programmed distribution`,
              value:
                view.preProgrammed === undefined
                  ? t`None`
                  : view.preProgrammedMoments === undefined
                    ? t`Configured`
                    : t`${formatInt(view.preProgrammedMoments)} scheduled releases`,
            },
            {
              label: t`New tokens go to`,
              value: view.destination ? (
                <IdentityRef id={view.destination} />
              ) : (
                t`The identity that mints them`
              ),
            },
            {
              label: t`Minting may choose a recipient`,
              value: view.mintingChoosesRecipient ? t`Yes` : t`No`,
            },
          ]}
        />
      </Card>
      {view.perpetual ? (
        <Card
          title={t`Perpetual distribution rules`}
          layer="platform"
          id="token-perpetual"
          source={source}
        >
          <JsonView value={view.perpetual} collapsedDepth={2} label={t`Perpetual distribution`} />
        </Card>
      ) : null}
      {view.preProgrammed ? (
        <Card
          title={t`Pre-programmed releases`}
          layer="platform"
          id="token-preprogrammed"
          source={source}
        >
          <JsonView
            value={view.preProgrammed}
            collapsedDepth={1}
            label={t`Pre-programmed distribution`}
          />
        </Card>
      ) : null}
      <LastClaim token={token} who={who} perpetual={view.perpetual !== undefined} />
    </div>
  )
}

function LastClaim({
  token,
  who,
  perpetual,
}: {
  token: TokenView
  who: string | undefined
  perpetual: boolean
}) {
  const { t } = useLingui()
  const resolved = useWho(who)
  const identityId = resolved.state === 'ready' ? resolved.id : ''
  const claim = useQuery({
    ...sdkQueries['tokens.perpetualDistributionLastClaim'](token.net, {
      identityId,
      tokenId: token.id,
    }),
    enabled: perpetual && identityId !== '',
  })
  return (
    <Card
      title={t`Last claim`}
      layer="platform"
      id="token-last-claim"
      source={claim.data ? stampOf(claim.data) : undefined}
    >
      {!perpetual ? (
        <Empty
          kind="none-yet"
          title={t`This token has no perpetual distribution.`}
          body={t`Only a token with a perpetual distribution has claims to look up.`}
        />
      ) : (
        <div className="grid gap-3">
          <WhoForm who={who} />
          <WhoProblem who={resolved} />
          {resolved.state === 'resolving' ? <Skeleton shape="line" /> : null}
          {resolved.state === 'ready' ? (
            <div className="grid gap-2" data-last-claim>
              <IdentityRef id={resolved.id} />
              {claim.isError && claim.data === undefined ? (
                <ErrorState error={claim.error} source="sdk" onRetry={() => void claim.refetch()} />
              ) : claim.data ? (
                claim.data.data ? (
                  <Moment moment={claim.data.data} />
                ) : (
                  <p>{t`This identity has not claimed from this token yet.`}</p>
                )
              ) : null}
            </div>
          ) : null}
          {resolved.state === 'none' ? (
            <p>{t`Enter an identity to see when it last claimed.`}</p>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function Moment({ moment }: { moment: RewardMomentDto }) {
  const { t } = useLingui()
  switch (moment.type) {
    case 'block':
      return <p>{t`Last claimed at Platform block ${formatInt(moment.blockHeight)}.`}</p>
    case 'epoch':
      return <p>{t`Last claimed in epoch ${formatInt(moment.epochIndex)}.`}</p>
    case 'time':
      return (
        <p>
          {t`Last claimed`} <Time ms={Number(moment.timestampMs)} mode="both" />
        </p>
      )
  }
}
