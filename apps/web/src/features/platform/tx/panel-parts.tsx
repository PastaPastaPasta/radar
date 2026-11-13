import { msg } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { Amount, Badge, DataTable, Hash, JsonView, KeyValue } from '@/ui'
import {
  bigintOf,
  fundingOf,
  isRecord,
  num,
  platformAddressOf,
  records,
  scriptAddressOf,
  str,
  type Json,
} from './decoded'

export interface Fact {
  label: ReactNode
  value: ReactNode
}

export function Facts({ items }: { items: Fact[] }) {
  return <KeyValue columns={2} items={items.filter((i) => i.value !== undefined)} />
}

export const Credits = ({ value }: { value: unknown }) => {
  const v = bigintOf(value)
  return v === undefined ? <>—</> : <Amount value={v} kind="credits" />
}

export const Who = ({ id }: { id: unknown }) => {
  const v = str(id)
  return v ? <Entity kind="identity" id={v} /> : <>—</>
}

export const ContractRef = ({ id }: { id: unknown }) => {
  const v = str(id)
  return v ? <Entity kind="contract" id={v} /> : <>—</>
}

export function Address({ hex, net }: { hex: unknown; net: NetworkId }) {
  const raw = str(hex)
  const text = raw ? platformAddressOf(raw, net) : undefined
  return text ? <Entity kind="platform-address" id={text} /> : <>{raw ?? '—'}</>
}

/** A Core address an output script pays, or the script itself when it is not a plain address. */
export function Script({ base64, net }: { base64: unknown; net: NetworkId }) {
  const raw = str(base64)
  if (!raw) return <>—</>
  const address = scriptAddressOf(raw, net)
  return address ? <Entity kind="address" id={address} /> : <Hash value={raw} />
}

const PURPOSES = [
  msg`Authentication`,
  msg`Encryption`,
  msg`Decryption`,
  msg`Transfer`,
  msg`System`,
  msg`Voting`,
  msg`Owner`,
]
const LEVELS = [msg`Master`, msg`Critical`, msg`High`, msg`Medium`]
const KEY_TYPES = [
  msg`ECDSA secp256k1`,
  msg`BLS12-381`,
  msg`ECDSA hash160`,
  msg`BIP13 script hash`,
  msg`EdDSA 25519 hash160`,
]

const named = (table: typeof PURPOSES, n: number | undefined): string =>
  n === undefined ? '—' : table[n] ? i18n._(table[n]) : String(n)

export function KeysTable({ keys, caption }: { keys: Json[]; caption: string }) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<Json>[]>(
    () => [
      {
        id: 'id',
        header: t`Key`,
        cell: ({ row }) => `#${String(num(row.original.id) ?? '—')}`,
        meta: { phone: 'title' },
      },
      {
        id: 'purpose',
        header: t`Purpose`,
        cell: ({ row }) => named(PURPOSES, num(row.original.purpose)),
        meta: { phone: 'secondary' },
      },
      {
        id: 'level',
        header: t`Security level`,
        cell: ({ row }) => named(LEVELS, num(row.original.securityLevel)),
        meta: { phone: 'secondary' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => named(KEY_TYPES, num(row.original.type)),
        meta: { phone: 'secondary' },
      },
      {
        id: 'readOnly',
        header: t`Read-only`,
        cell: ({ row }) => (row.original.readOnly === true ? t`Yes` : t`No`),
        meta: { phone: 'hidden' },
      },
      {
        id: 'data',
        header: t`Public key`,
        cell: ({ row }) => {
          const data = str(row.original.data)
          return data ? <Hash value={data} /> : '—'
        },
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={keys}
      getRowId={(k) => String(num(k.id) ?? Math.random())}
      state={keys.length === 0 ? 'empty' : 'ready'}
    />
  )
}

/** Inputs or outputs of an address-based transition: an address and an amount, and a nonce for an input. */
export function AddressTable({
  rows,
  net,
  caption,
  nonce = false,
}: {
  rows: Json[]
  net: NetworkId
  caption: string
  nonce?: boolean
}) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<Json>[]>(
    () => [
      {
        id: 'address',
        header: t`Address`,
        cell: ({ row }) => <Address hex={row.original.address} net={net} />,
        meta: { phone: 'title' },
      },
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) => <Credits value={row.original.amount} />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      ...(nonce
        ? [
            {
              id: 'nonce',
              header: t`Nonce`,
              cell: ({ row }) => formatInt(num(row.original.nonce) ?? 0),
              meta: { numeric: true, phone: 'secondary' },
            } satisfies ColumnDef<Json>,
          ]
        : []),
    ],
    [t, net, nonce],
  )
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(r, ) => `${str(r.address) ?? ''}:${String(num(r.nonce) ?? '')}:${String(r.amount)}`}
      state={rows.length === 0 ? 'empty' : 'ready'}
    />
  )
}

/** The Core transaction behind an asset-lock proof, linked when its id can be read from the proof. */
export function Funding({ proof }: { proof: unknown }) {
  const { t } = useLingui()
  const f = fundingOf(proof)
  if (!f) return <>—</>
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge>{f.kind === 'instant' ? t`InstantSend lock` : t`ChainLock`}</Badge>
      {f.txid ? (
        <Entity kind="tx" id={f.txid} />
      ) : null}
      {f.vout === undefined ? null : <span className="rx-dim">{t`output ${f.vout}`}</span>}
    </span>
  )
}

export const FeeStrategy = ({ value }: { value: unknown }) => {
  const { t } = useLingui()
  const steps = records(value)
  if (steps.length === 0) return <>—</>
  return (
    <>
      {steps
        .map((s) => {
          const index = num(s.index) ?? 0
          return str(s.$type) === 'reduceOutput'
            ? t`reduce output ${index}`
            : t`deduct from input ${index}`
        })
        .join(', ')}
    </>
  )
}

/** The decoded fields as a collapsed tree, for whatever the readable facts leave out. */
export function Fields({ value, label }: { value: unknown; label: string }) {
  return isRecord(value) || Array.isArray(value) ? (
    <JsonView value={value} collapsedDepth={1} label={label} />
  ) : null
}
