import { useLingui } from '@lingui/react/macro'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { PeTransaction } from '@/data/pe/schemas'
import type { StateTransitionDecodedDto } from '@/data/sdk/methods/p-blocks'
import { bytesToHex } from '@/lib/hex'
import { Card, JsonView, SegFilter } from '@/ui'

type Raw = 'json' | 'hex' | 'base64'

function fromBase64(value: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

/** The transition's bytes as hex or base64, or its fields as JSON: the decoded fields when the SDK read them, else Explorer's record. */
export function RawCard({
  tx,
  decoded,
  source,
}: {
  tx: PeTransaction
  decoded?: StateTransitionDecodedDto
  source: SourceStamp | SourceStamp[]
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const search: { raw?: Raw } = useSearch({ strict: false })
  const raw: Raw = search.raw ?? 'json'
  const bytes = useMemo(() => (tx.data ? fromBase64(tx.data) : undefined), [tx.data])
  const json = useMemo(
    () =>
      decoded
        ? {
            type: decoded.actionType,
            hash: decoded.hash,
            ownerId: decoded.ownerId,
            identityNonce: decoded.identityNonce,
            identityContractNonce: decoded.identityContractNonce,
            userFeeIncrease: decoded.userFeeIncrease,
            signaturePublicKeyId: decoded.signaturePublicKeyId,
            body: decoded.body,
          }
        : tx,
    [decoded, tx],
  )
  return (
    <Card
      layer="platform"
      title={t`Raw data`}
      source={source}
      actions={
        <SegFilter
          label={t`Format`}
          value={raw}
          options={[
            { id: 'json', label: 'JSON' },
            { id: 'hex', label: 'Hex' },
            { id: 'base64', label: 'Base64' },
          ]}
          onChange={(next) => {
            void navigate({
              to: '.',
              search: ((prev: Record<string, unknown>) => ({
                ...prev,
                raw: next === 'json' ? undefined : next,
              })) as never,
              replace: true,
            })
          }}
        />
      }
    >
      {raw === 'json' ? (
        <JsonView value={json} collapsedDepth={1} label={t`State transition as JSON`} />
      ) : !tx.data || !bytes ? (
        <p className="rx-note">{t`Platform Explorer has no bytes for this transition.`}</p>
      ) : (
        <pre
          className="rx-mono"
          style={{
            overflow: 'auto',
            maxHeight: 420,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
          data-raw={raw}
        >
          {raw === 'hex' ? bytesToHex(bytes) : tx.data}
        </pre>
      )}
    </Card>
  )
}
