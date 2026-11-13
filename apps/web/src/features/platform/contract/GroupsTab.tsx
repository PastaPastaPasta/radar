import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { Card, Empty } from '@/ui'
import { GroupsTable } from '../groups/GroupsTable'
import type { ContractContext } from './contract-context'

/** The groups the contract defines, with the power each decision needs; each opens its members and actions. */
export function GroupsTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { id, contract, stamp } = ctx
  return (
    <Card
      title={t`Groups`}
      layer="platform"
      source={stamp}
      id="groups"
      actions={
        contract.groups.length > 0 ? (
          <Link className="dh-btn dh-btn--sm" to="/groups/$contract" params={{ contract: id }}>
            {t`Open groups page`}
          </Link>
        ) : undefined
      }
    >
      <GroupsTable
        contract={id}
        rows={contract.groups}
        caption={t`Groups of this contract`}
        empty={<Empty kind="none-yet" title={t`This contract defines no groups.`} />}
      />
    </Card>
  )
}
