import { useLingui } from '@lingui/react/macro'
import { Badge, Card, JsonView, KeyValue } from '@/ui'
import type { ContractContext } from './contract-context'

/** The contract's internal configuration as the SDK reports it. */
export function ConfigTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { contract, stamp } = ctx
  const yes = (v: unknown) =>
    v === true ? <Badge size="sm" tone="success">{t`Yes`}</Badge> : <Badge size="sm">{t`No`}</Badge>
  const c = contract.config
  return (
    <Card title={t`Configuration`} layer="platform" source={stamp} id="config">
      <div className="grid gap-4">
        <KeyValue
          columns={2}
          items={[
            { label: t`Keeps version history`, value: yes(c.keepsHistory) },
            { label: t`Read-only`, value: yes(c.readonly) },
            { label: t`Can be deleted`, value: yes(c.canBeDeleted) },
            {
              label: t`Documents keep history by default`,
              value: yes(c.documentsKeepHistoryContractDefault),
            },
            {
              label: t`Documents mutable by default`,
              value: yes(c.documentsMutableContractDefault),
            },
            {
              label: t`Documents deletable by default`,
              value: yes(c.documentsCanBeDeletedContractDefault),
            },
          ]}
        />
        <JsonView value={c} collapsedDepth={1} label={t`Configuration JSON`} />
      </div>
    </Card>
  )
}
