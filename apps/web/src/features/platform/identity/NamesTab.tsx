import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, Empty } from '@/ui'
import { loadState, nameLabel, type IdentityTabProps } from './common'
import { NAMES_LIMIT } from './OverviewTab'

export function NamesTab({ id }: IdentityTabProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const names = useQuery(sdkQueries['dpns.usernames'](net, { identityId: id, limit: NAMES_LIMIT }))
  const list = names.data?.data ?? []
  return (
    <Card
      title={t`DPNS names`}
      layer="platform"
      id="identity-names"
      source={names.data ? stampOf(names.data) : undefined}
      state={list.length === 0 && !names.isPending && !names.isError ? 'ready' : loadState(names)}
      error={names.error}
      onRetry={() => void names.refetch()}
    >
      {list.length === 0 ? (
        <Empty kind="none-yet" title={t`This identity owns no names.`} />
      ) : (
        <>
          <ul className="grid gap-2" data-names>
            {list.map((n) => (
              <li key={n}>
                <Entity kind="name" id={nameLabel(n)} label={n} />
              </li>
            ))}
          </ul>
          {list.length >= NAMES_LIMIT ? (
            <p className="rx-dim">{t`Showing the first ${formatInt(NAMES_LIMIT)} names.`}</p>
          ) : null}
        </>
      )}
    </Card>
  )
}
