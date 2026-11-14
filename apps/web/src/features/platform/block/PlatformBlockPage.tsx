import { useLingui } from '@lingui/react/macro'
import type { LinkProps } from '@tanstack/react-router'
import { useSearch } from '@tanstack/react-router'
import { useDecentralizedOnly } from '@/data/health'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { parseBlockRef, type BlockRef } from '@/data/pe/blocks-query'
import type { PeBlock } from '@/data/pe/schemas'
import { Entity, PageFrame, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, Empty, ErrorState, Hash, KeyValue, Skeleton, Tabs, Time, Unavailable } from '@/ui'
import { useEpochOf } from '../blocks/use-epoch-of'
import { BlockInfoTab } from './BlockInfoTab'
import { BlockLookup } from './BlockLookup'
import { QuorumTab } from './QuorumTab'
import { TransitionsTab } from './TransitionsTab'
import { usePlatformBlock } from './use-platform-block'

type Tab = 'transitions' | 'quorum' | 'info'

export function PlatformBlockPage({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const ref = parseBlockRef(id)
  return (
    <PageFrame
      path="/platform/block/$id"
      title={t`Platform block`}
      eyebrow={t`Platform`}
      layer="platform"
      share
    >
      {off ? (
        <Unavailable source="pe" title={t`Block pages need Platform Explorer's index`} />
      ) : isDevnet(net) ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      ) : ref === undefined ? (
        <NotABlock value={id} />
      ) : (
        <Record id={id} blockRef={ref} />
      )}
    </PageFrame>
  )
}

function NotABlock({ value }: { value: string }) {
  const { t } = useLingui()
  return (
    <Empty
      kind="not-found"
      title={t`That isn't a block height or hash.`}
      body={
        <>
          <span className="block">{t`A Platform block is named by its height or by a hash of 64 hexadecimal characters.`}</span>
          <code className="rx-mono">{value}</code>
        </>
      }
      action={<BlockLookup />}
    />
  )
}

function Record({ id, blockRef }: { id: string; blockRef: BlockRef }) {
  const { t } = useLingui()
  const net = useNetwork()
  const state = usePlatformBlock(net, blockRef)
  const search: { tab?: Tab; page?: number } = useSearch({ strict: false })
  const tab: Tab = search.tab ?? 'transitions'

  if (state.missing) {
    return (
      <Empty
        kind="not-found"
        title={t`Platform Explorer has no block ${id.length > 12 ? `${id.slice(0, 8)}…` : id}`}
        body={t`It may be newer than the index, or the height or hash may be mistyped.`}
        action={<BlockLookup />}
      />
    )
  }
  const response = state.block.data
  const block = response?.data
  if (!response || !block) {
    if (state.block.isError || state.lookup.isError) {
      return <ErrorState error={state.error} source="pe" onRetry={state.refetch} />
    }
    return <Skeleton shape="block" height={280} />
  }
  const stamp = stampOf(response)
  return (
    <>
      <Summary block={block} stamp={stamp} />
      <Tabs
        tabs={[
          { id: 'transitions', label: t`Transitions`, count: block.txs.length },
          { id: 'quorum', label: t`Quorum`, disabled: !block.quorum },
          { id: 'info', label: t`Details` },
        ]}
        value={tab}
        layer="platform"
        to={(next) =>
          ({
            to: '/platform/block/$id',
            params: { id },
            search: (s: Record<string, unknown>) => ({
              ...s,
              tab: next === 'transitions' ? undefined : next,
              page: undefined,
            }),
          }) as LinkProps
        }
      />
      {tab === 'transitions' ? <TransitionsTab block={block} stamp={stamp} /> : null}
      {tab === 'quorum' ? <QuorumTab block={block} stamp={stamp} /> : null}
      {tab === 'info' ? <BlockInfoTab block={block} stamp={stamp} /> : null}
    </>
  )
}

function Summary({ block, stamp }: { block: PeBlock; stamp: SourceStamp }) {
  const { t } = useLingui()
  const h = block.header
  const { epochOf, stamp: epochStamp, missing: epochMissing } = useEpochOf()
  const epoch = epochOf?.(h.height)
  return (
    <Card
      layer="platform"
      title={t`Block ${formatInt(h.height)}`}
      source={epoch !== undefined && epochStamp ? [stamp, stampOf(epochStamp)] : stamp}
      actions={
        <span className="flex gap-2">
          {h.height > 1 ? (
            <PageLink
              to={`/platform/block/${h.height - 1}`}
              className="dh-btn dh-btn--sm"
              rel="prev"
            >
              {t`Previous block`}
            </PageLink>
          ) : null}
          <PageLink to={`/platform/block/${h.height + 1}`} className="dh-btn dh-btn--sm" rel="next">
            {t`Next block`}
          </PageLink>
        </span>
      }
    >
      {epochMissing ? (
        <ErrorState
          error={epochMissing.error}
          source="sdk"
          compact
          onRetry={() => void epochMissing.refetch()}
        />
      ) : null}
      <KeyValue
        columns={2}
        items={[
          { label: t`Height`, value: formatInt(h.height) },
          { label: t`Hash`, value: <Hash value={h.hash} display="wrap" /> },
          { label: t`Time`, value: <Time ms={h.timestamp} mode="both" seconds /> },
          {
            label: t`Epoch`,
            value: epoch === undefined ? '—' : <Entity kind="epoch" id={String(epoch)} />,
          },
          { label: t`Proposer`, value: <Entity kind="evonode" id={h.validator} /> },
          {
            label: t`Transitions`,
            value: formatInt(block.txs.length),
          },
          {
            label: t`Gas used`,
            value: h.totalGasUsed == null ? '—' : formatInt(h.totalGasUsed),
          },
          {
            label: t`App version`,
            value: h.appVersion == null ? '—' : String(h.appVersion),
          },
          {
            label: t`Block version`,
            value: h.blockVersion == null ? '—' : String(h.blockVersion),
          },
          {
            label: t`Locked to Core block`,
            value:
              h.l1LockedHeight == null ? (
                '—'
              ) : (
                <Entity kind="block" id={String(h.l1LockedHeight)} />
              ),
          },
          {
            label: t`Core block hash`,
            value: h.l1LockedBlockHash ? <Hash value={h.l1LockedBlockHash} /> : '—',
          },
          {
            label: t`App hash`,
            value: h.appHash ? <Hash value={h.appHash} /> : '—',
          },
          {
            label: t`Quorum hash`,
            value: h.quorumHash ? <Hash value={h.quorumHash} /> : '—',
          },
        ]}
      />
    </Card>
  )
}
