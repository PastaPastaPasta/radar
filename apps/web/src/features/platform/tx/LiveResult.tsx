import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { Badge, Card, ErrorState, KeyValue, Skeleton } from '@/ui'
import { Credits } from './panel-parts'

export type PeStatus = 'success' | 'failed' | undefined

/** What a node says about the transition now (NX-60): it executed, it failed with an error, or it has no result yet. */
export function LiveResult({ hash, indexed }: { hash: string; indexed: PeStatus }) {
  const { t } = useLingui()
  const net = useNetwork()
  const live = useQuery({
    ...sdkQueries['stateTransitions.waitForStateTransitionResult'](net, {
      hash: hash.toLowerCase(),
    }),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const result = live.data?.data
  return (
    <div data-live-result>
      <Card
        layer="platform"
        title={t`Result from a node`}
        source={live.data ? stampOf(live.data) : undefined}
        actions={
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            disabled={live.isFetching}
            onClick={() => {
              void live.refetch()
            }}
          >
            {t`Check again`}
          </button>
        }
      >
        {result ? (
          <>
            <KeyValue
              columns={2}
              items={[
                {
                  label: t`Status`,
                  value:
                    result.status === 'executed' ? (
                      <Badge tone="success">{t`Executed`}</Badge>
                    ) : result.status === 'failed' ? (
                      <Badge tone="danger">{t`Failed`}</Badge>
                    ) : (
                      <Badge>{t`No result yet`}</Badge>
                    ),
                },
                ...(result.error ? [{ label: t`Error`, value: result.error }] : []),
                ...(result.ownerBalance === undefined
                  ? []
                  : [
                      {
                        label: t`Owner balance after`,
                        value: <Credits value={result.ownerBalance} />,
                      },
                    ]),
              ]}
            />
            {result.status === 'pending' ? (
              <p className="rx-note" data-live-note="pending">
                {indexed
                  ? t`The node reported no result within a few seconds. Nodes keep only recent results, so an older transition may show none.`
                  : t`The node reported no result within a few seconds: this transition has not executed yet, or no node knows it.`}
              </p>
            ) : null}
            {(result.status === 'executed' && indexed === 'failed') ||
            (result.status === 'failed' && indexed === 'success') ? (
              <p className="rx-note" role="status" data-live-note="disagree">
                {t`The node and Platform Explorer disagree about this transition. Each is shown with its own source.`}
              </p>
            ) : null}
          </>
        ) : live.isError ? (
          <ErrorState
            compact
            error={live.error}
            source="dapi"
            onRetry={() => {
              void live.refetch()
            }}
          />
        ) : (
          <div aria-busy="true">
            <Skeleton shape="line" />
            <p className="rx-note">{t`Asking a node for the result. This can take a few seconds.`}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
