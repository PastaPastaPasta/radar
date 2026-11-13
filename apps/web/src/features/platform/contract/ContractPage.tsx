import { useLingui } from '@lingui/react/macro'
import type { LinkProps } from '@tanstack/react-router'
import { stampOf } from '@/data/envelope'
import { IdentityRef, PageFrame, SaveButton, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import { Badge, Card, Empty, Hash, KeyValue, LinkOut, Skeleton, Tabs } from '@/ui'
import { ActivityTab } from './ActivityTab'
import { ConfigTab } from './ConfigTab'
import type { ContractContext, ContractPageSearch, ContractTab } from './contract-context'
import { contractName, typeNames, useContract, usePeContract } from './contract-data'
import { GroupsTab } from './GroupsTab'
import { HistoryTab } from './HistoryTab'
import { OverviewTab } from './OverviewTab'
import { SchemaTab } from './SchemaTab'
import { SdkGate } from './SdkGate'
import { TokensTab } from './TokensTab'
import { TypesList } from './TypesList'

export interface ContractPageProps {
  id: string
  search: ContractPageSearch
}

export function ContractPage({ id, search }: ContractPageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const contract = useContract(net, id)
  const pe = usePeContract(net, id)
  const data = contract.data?.data ?? null
  const name = contractName(net, id, pe.data?.data?.name)

  return (
    <PageFrame
      path="/contract/$id"
      title={t`Contract`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={name}
      actions={
        <>
          {data ? <SaveButton kind="contract" id={id} {...(name ? { label: name } : {})} /> : null}
          <LinkOut
            to={{ app: 'bridge', action: 'contract', id, net }}
          >{t`Manage in Bridge`}</LinkOut>
        </>
      }
    >
      {!isPlatformId(id) ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a contract ID.`}
          body={
            <>
              <Hash value={id} display="wrap" copy={false} />
              <span className="block">{t`A contract ID is 44 base58 characters or fewer.`}</span>
            </>
          }
        />
      ) : (
        <SdkGate query={contract} skeleton={<Skeleton shape="block" height={220} />}>
          {!data || !contract.data ? (
            <Empty
              kind="not-found"
              title={t`No contract has this ID on this network.`}
              body={<Hash value={id} display="wrap" />}
            />
          ) : (
            <Loaded
              ctx={{
                net,
                id,
                contract: data,
                stamp: stampOf(contract.data),
                search,
              }}
              pe={pe}
            />
          )}
        </SdkGate>
      )}
    </PageFrame>
  )
}

function Loaded({ ctx, pe }: { ctx: ContractContext; pe: ReturnType<typeof usePeContract> }) {
  const { t } = useLingui()
  const { id, contract, search } = ctx
  const tab: ContractTab = search.tab
  const tabs: { id: ContractTab; label: string; count?: number }[] = [
    { id: 'overview', label: t`Overview` },
    { id: 'schema', label: t`Schema` },
    { id: 'types', label: t`Types`, count: typeNames(contract).length },
    { id: 'tokens', label: t`Tokens`, count: contract.tokens.length },
    { id: 'groups', label: t`Groups`, count: contract.groups.length },
    { id: 'history', label: t`History` },
    { id: 'config', label: t`Config` },
    { id: 'transactions', label: t`Transitions` },
    { id: 'documents', label: t`Documents` },
  ]
  return (
    <>
      <Card title={t`Contract`} layer="platform" source={ctx.stamp} id="contract">
        <KeyValue
          columns={2}
          items={[
            { label: t`ID`, value: <Hash value={id} display="wrap" /> },
            {
              label: t`Owner`,
              value: <IdentityRef id={contract.ownerId} />,
            },
            { label: t`Version`, value: formatInt(contract.version) },
            {
              label: t`Version history`,
              value: contract.keepsHistory ? (
                <Badge tone="info">{t`Kept`}</Badge>
              ) : (
                <Badge>{t`Not kept`}</Badge>
              ),
            },
            {
              label: t`Document types`,
              value: formatInt(typeNames(contract).length),
            },
            { label: t`Tokens`, value: formatInt(contract.tokens.length) },
            { label: t`Groups`, value: formatInt(contract.groups.length) },
            ...(contract.config.readonly === true
              ? [{ label: t`Read-only`, value: <Badge>{t`Yes`}</Badge> }]
              : []),
          ]}
        />
      </Card>
      <div className="min-w-0">
        <Tabs
          tabs={tabs}
          value={tab}
          layer="platform"
          to={(next) =>
            ({
              to: '/contract/$id',
              params: { id },
              search: (s: Record<string, unknown>) => ({
                ...s,
                tab: next === 'overview' ? undefined : next,
                page: undefined,
                path: undefined,
                rev: undefined,
                base: undefined,
                type: undefined,
                owner: undefined,
                from: undefined,
                to: undefined,
              }),
            }) as LinkProps
          }
        />
      </div>
      {tab === 'overview' ? <OverviewTab ctx={ctx} pe={pe} /> : null}
      {tab === 'schema' ? <SchemaTab ctx={ctx} /> : null}
      {tab === 'types' ? (
        <Card title={t`Document types`} layer="platform" source={ctx.stamp} id="types">
          <TypesList id={id} contract={contract} expanded />
        </Card>
      ) : null}
      {tab === 'tokens' ? <TokensTab ctx={ctx} /> : null}
      {tab === 'groups' ? <GroupsTab ctx={ctx} /> : null}
      {tab === 'history' ? <HistoryTab ctx={ctx} /> : null}
      {tab === 'config' ? <ConfigTab ctx={ctx} /> : null}
      {tab === 'transactions' ? <ActivityTab ctx={ctx} kind="transactions" /> : null}
      {tab === 'documents' ? <ActivityTab ctx={ctx} kind="documents" /> : null}
    </>
  )
}
