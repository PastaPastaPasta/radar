import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useDecentralizedOnly } from '@/data/health'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import { HASH } from '@/data/pe/blocks-query'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import type { StateTransitionDecodedDto } from '@/data/sdk/methods/p-blocks'
import { sdkQueries } from '@/data/sdk/queries'
import {
  Entity,
  IdentityRef,
  PageFrame,
  TransitionTable,
  transitionBadgeType,
  useNetwork,
} from '@/features/entity'
import { formatInt } from '@/lib/format'
import { bytesToHex } from '@/lib/hex'
import { isDevnet, type NetworkId } from '@/lib/network'
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Hash,
  KeyValue,
  Skeleton,
  Time,
  TypeBadge,
  Unavailable,
} from '@/ui'
import { BlockLookup } from '../block/BlockLookup'
import { LiveResult, type PeStatus } from './LiveResult'
import { humanize } from './decoded'
import { Credits, Facts, type Fact } from './panel-parts'
import { RawCard } from './RawCard'
import { TypePanel } from './panels'

export function TransitionPage({ hash }: { hash: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = HASH.test(hash)
  return (
    <PageFrame
      path="/platform/tx/$hash"
      title={t`State transition`}
      eyebrow={t`Platform`}
      layer="platform"
      share
    >
      {isDevnet(net) ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      ) : !valid ? (
        <Empty
          kind="not-found"
          title={t`That isn't a state transition hash.`}
          body={
            <>
              <span className="block">{t`A state transition is named by a hash of 64 hexadecimal characters.`}</span>
              <code className="rx-mono">{hash}</code>
            </>
          }
          action={<BlockLookup />}
        />
      ) : (
        <Record hash={hash.toLowerCase()} />
      )}
    </PageFrame>
  )
}

const statusOf = (tx: PeTransaction | undefined): PeStatus => {
  const s = tx?.status.toUpperCase()
  return s === 'SUCCESS'
    ? 'success'
    : s === 'FAIL' || s === 'FAILED' || s === 'ERROR'
      ? 'failed'
      : undefined
}

function Record({ hash }: { hash: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const pe = useQuery({ ...peQueries.transaction(net, hash), enabled: !off })
  const tx = pe.data?.data ?? undefined
  const stamp = pe.data ? stampOf(pe.data) : undefined
  const decodedQuery = useQuery({
    ...sdkQueries['stateTransitions.decode'](net, { data: tx?.data ?? '' }),
    enabled: !off && Boolean(tx?.data),
    retry: false,
  })
  const decoded = decodedQuery.data?.data

  if (off) {
    return (
      <div className="grid gap-4">
        <Unavailable
          source="pe"
          title={t`The indexed details of a transition need Platform Explorer's index`}
        />
        <LiveResult hash={hash} indexed={undefined} />
      </div>
    )
  }
  return (
    <div className="grid gap-4">
      {pe.isError ? (
        <ErrorState
          error={pe.error}
          source="pe"
          onRetry={() => {
            void pe.refetch()
          }}
        />
      ) : pe.isPending ? (
        <Skeleton shape="block" height={220} />
      ) : tx && stamp ? (
        <Summary tx={tx} stamp={stamp} feeIncrease={decoded?.userFeeIncrease} />
      ) : (
        <Card layer="platform" title={t`Not in Platform Explorer's index`}>
          <p className="rx-note" data-not-indexed>
            {t`Platform Explorer has no record of this transition. It may be newer than the index, or it may never have been sent. The node's answer is below.`}
          </p>
        </Card>
      )}
      <LiveResult hash={hash} indexed={statusOf(tx)} />
      {tx && stamp ? (
        <>
          <Details query={decodedQuery} net={net} hasBytes={Boolean(tx.data)} stamp={stamp} />
          <Duplicates tx={tx} stamp={stamp} />
          <RawCard tx={tx} decoded={decoded} source={stamp} />
        </>
      ) : null}
    </div>
  )
}

function Summary({
  tx,
  stamp,
  feeIncrease,
}: {
  tx: PeTransaction
  stamp: SourceStamp
  feeIncrease?: number
}) {
  const { t } = useLingui()
  const badge = transitionBadgeType(tx.type, tx.batchType)
  const status = statusOf(tx)
  const owner = tx.owner?.identifier
  const items: Fact[] = [
    {
      label: t`Type`,
      value: badge ? <TypeBadge type={badge} /> : <Badge>{humanize(tx.type)}</Badge>,
    },
    {
      label: t`Status`,
      value:
        status === 'success' ? (
          <Badge tone="success">{t`Success`}</Badge>
        ) : status === 'failed' ? (
          <Badge tone="danger">{t`Failed`}</Badge>
        ) : (
          <Badge>{humanize(tx.status)}</Badge>
        ),
    },
    ...(tx.error ? [{ label: t`Error`, value: tx.error }] : []),
    { label: t`Hash`, value: <Hash value={tx.hash} display="wrap" /> },
    { label: t`Time`, value: <Time ms={tx.timestamp} mode="both" seconds /> },
    {
      label: t`Block`,
      value:
        tx.blockHeight == null ? (
          '—'
        ) : (
          <Entity
            kind="platform-block"
            id={String(tx.blockHeight)}
            label={formatInt(tx.blockHeight)}
          />
        ),
    },
    { label: t`Position in block`, value: tx.index == null ? '—' : formatInt(tx.index + 1) },
    { label: t`Sent by`, value: owner ? <IdentityRef id={owner} /> : '—' },
    {
      label: t`Gas used`,
      value: tx.gasUsed == null ? '—' : formatInt(tx.gasUsed),
    },
    {
      label: t`Fee multiplier`,
      value: feeIncrease === undefined ? '—' : `×${(1 + feeIncrease / 100).toFixed(2)}`,
    },
  ]
  if (tx.bech32mAddress)
    items.push({
      label: t`Platform address`,
      value: <Entity kind="platform-address" id={tx.bech32mAddress} />,
    })
  if (tx.amount != null) items.push({ label: t`Amount`, value: <Credits value={tx.amount} /> })
  if (tx.shielded)
    items.push({
      label: t`Shielded`,
      value: [
        tx.shielded.direction,
        tx.shielded.amount == null ? undefined : formatInt(tx.shielded.amount),
      ]
        .filter(Boolean)
        .join(' · '),
    })
  return (
    <Card layer="platform" title={t`State transition`} source={stamp}>
      <KeyValue columns={2} items={items} />
    </Card>
  )
}

function Details({
  query,
  net,
  hasBytes,
  stamp,
}: {
  query: { data?: Sourced<StateTransitionDecodedDto>; isError: boolean; isPending: boolean }
  net: NetworkId
  hasBytes: boolean
  stamp: SourceStamp | SourceStamp[]
}) {
  const { t } = useLingui()
  const decoded = query.data?.data
  return (
    <div data-details>
      <Card layer="platform" title={t`What it does`} source={stamp}>
        {decoded ? (
          <>
            <Facts
              items={[
                { label: t`SDK action`, value: decoded.actionType },
                {
                  label: t`Identity nonce`,
                  value:
                    decoded.identityNonce === undefined
                      ? undefined
                      : formatInt(decoded.identityNonce),
                },
                {
                  label: t`Contract nonce`,
                  value:
                    decoded.identityContractNonce === undefined
                      ? undefined
                      : formatInt(decoded.identityContractNonce),
                },
                {
                  label: t`Signed with key`,
                  value:
                    decoded.signaturePublicKeyId === undefined
                      ? undefined
                      : `#${String(decoded.signaturePublicKeyId)}`,
                },
                {
                  label: t`Signature`,
                  value: decoded.signature ? (
                    <Hash value={bytesToHex(decoded.signature)} />
                  ) : undefined,
                },
              ]}
            />
            <TypePanel decoded={decoded} net={net} />
          </>
        ) : !hasBytes ? (
          <p className="rx-note" data-no-bytes>
            {t`Platform Explorer keeps no bytes for this transition, as it does for one that did not execute, so its fields can't be read here.`}
          </p>
        ) : query.isError ? (
          <p className="rx-note" data-decode-failed>
            {t`Radar could not read this transition's fields from its bytes. Its raw data is below.`}
          </p>
        ) : (
          <Skeleton shape="block" height={140} />
        )}
      </Card>
    </div>
  )
}

function Duplicates({ tx, stamp }: { tx: PeTransaction; stamp: SourceStamp }) {
  const { t } = useLingui()
  const rows = tx.duplicates ?? []
  if (rows.length === 0) return null
  return (
    <div data-duplicates>
      <Card layer="platform" padding="flush" title={t`Sent again in later blocks`} source={stamp}>
        <TransitionTable
          rows={rows}
          state="ready"
          columns={['status', 'hash', 'block', 'time']}
          caption={t`The same transition seen again in later blocks`}
        />
      </Card>
    </div>
  )
}
