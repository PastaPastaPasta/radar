import { useLingui } from '@lingui/react/macro'
import type { UseQueryResult } from '@tanstack/react-query'
import { stampOf, type Sourced } from '@/data/envelope'
import type { CoreChainLock, CoreChainStatus } from '@/data/core/types'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, Hash, KeyValue, Time, stampsOf } from '@/ui'

type Tip = Sourced<{ height: number; hash: string; time: number }>
type ChainLock = Sourced<CoreChainLock>

export interface CoreCardProps {
  tip: UseQueryResult<Tip>
  chainLock: UseQueryResult<ChainLock>
  chain: UseQueryResult<Sourced<CoreChainStatus>>
}

function stateOf(...results: UseQueryResult[]): 'loading' | 'error' | 'ready' {
  if (results.every((r) => r.data === undefined && r.isError)) return 'error'
  if (results.every((r) => r.data === undefined)) return 'loading'
  return 'ready'
}

export function CoreCard({ tip, chainLock, chain }: CoreCardProps) {
  const { t } = useLingui()
  const state = stateOf(tip, chainLock, chain)
  const behind =
    tip.data && chainLock.data
      ? Math.max(0, tip.data.data.height - chainLock.data.data.height)
      : undefined

  const claim = chainLock.data?.data.claim !== undefined

  const missing = (r: UseQueryResult) => (r.isError ? t`Not available right now` : '…')

  return (
    <Card
      id="core"
      layer="core"
      title={t`Dash Core`}
      subtitle={t`What the evonodes report about the chain right now.`}
      state={state}
      error={tip.error ?? chainLock.error ?? chain.error}
      onRetry={() => {
        void tip.refetch()
        void chainLock.refetch()
        void chain.refetch()
      }}
      source={stampsOf(tip.data, chainLock.data, chain.data)}
    >
      <KeyValue
        columns={2}
        items={[
          {
            label: t`Core tip`,
            value: tip.data ? (
              <span data-status="tip">
                {formatInt(tip.data.data.height)} ·{' '}
                <Time ms={tip.data.data.time} mode="both" live />
              </span>
            ) : (
              missing(tip)
            ),
            source: tip.data ? stampOf(tip.data) : undefined,
          },
          {
            label: t`Best ChainLock`,
            value: chainLock.data ? (
              <span data-status="chainlock">
                {formatInt(chainLock.data.data.height)}
                {behind === undefined || behind === 0
                  ? ''
                  : ` · ${t`${behind} blocks behind the tip`}`}
                {claim ? (
                  <span data-claim="one-node"> · {t`ChainLock reported by one node`}</span>
                ) : null}
              </span>
            ) : (
              missing(chainLock)
            ),
            source: chainLock.data ? stampOf(chainLock.data) : undefined,
          },
          {
            label: t`Tip hash`,
            value: tip.data ? <Hash value={tip.data.data.hash} /> : missing(tip),
          },
          {
            label: claim
              ? t`ChainLock block hash, reported by one node`
              : t`ChainLocked block hash`,
            value: chainLock.data ? <Hash value={chainLock.data.data.hash} /> : missing(chainLock),
          },
          {
            label: t`Node sync`,
            value: chain.data ? (
              <span data-status="sync">
                {chain.data.data.isSynced
                  ? t`Synced`
                  : t`Catching up, ${formatPercent(chain.data.data.syncProgress, 1)}`}
              </span>
            ) : (
              missing(chain)
            ),
            source: chain.data ? stampOf(chain.data) : undefined,
          },
          {
            label: t`Headers and blocks`,
            value: chain.data
              ? `${formatInt(chain.data.data.headers)} / ${formatInt(chain.data.data.blocks)}`
              : missing(chain),
          },
        ]}
      />
    </Card>
  )
}
