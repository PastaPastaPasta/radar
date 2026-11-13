import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageFrame, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { Card, Empty, Hash, Skeleton } from '@/ui'
import { SdkGate } from '../contract/SdkGate'
import { GroupsTable } from './GroupsTable'

export function GroupsPage({ contract }: { contract: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(contract)
  const infos = useQuery({
    ...sdkQueries['group.infos'](net, { contractId: contract }),
    enabled: valid,
  })
  const groups = infos.data?.data ?? []
  return (
    <PageFrame
      path="/groups/$contract"
      title={t`Groups`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`A group lists identities and the power each holds; a decision needs enough power to reach the group’s threshold.`}
    >
      {!valid ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a contract ID.`}
          body={<Hash value={contract} display="wrap" copy={false} />}
        />
      ) : (
        <Card
          title={t`Groups of this contract`}
          layer="platform"
          id="groups"
          source={infos.data ? stampOf(infos.data) : undefined}
          subtitle={<Entity kind="contract" id={contract} />}
          actions={
            <Link className="dh-btn dh-btn--sm" to="/contract/$id" params={{ id: contract }}>
              {t`Open the contract`}
            </Link>
          }
        >
          <SdkGate query={infos} skeleton={<Skeleton shape="row" count={3} />}>
            <GroupsTable
              contract={contract}
              rows={groups}
              caption={t`Groups`}
              empty={
                <Empty
                  kind="none-yet"
                  title={t`This contract has no groups.`}
                  body={t`Only a contract that defines groups, usually for its tokens, has any.`}
                />
              }
            />
          </SdkGate>
        </Card>
      )}
    </PageFrame>
  )
}
