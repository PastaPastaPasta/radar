import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export const DECODER_IDS = ['contract', 'identity', 'document', 'proof', 'path'] as const
export type DecoderId = (typeof DECODER_IDS)[number]

export function isDecoderId(value: string): value is DecoderId {
  return (DECODER_IDS as readonly string[]).includes(value)
}

export const DECODER_TEXT: Record<
  DecoderId,
  { title: MessageDescriptor; about: MessageDescriptor }
> = {
  contract: {
    title: msg`Contract decoder`,
    about: msg`Paste the serialized bytes of a data contract to read its document types, tokens and groups.`,
  },
  identity: {
    title: msg`Identity decoder`,
    about: msg`Paste the serialized bytes of an identity to read its keys, balance and revision.`,
  },
  document: {
    title: msg`Document decoder`,
    about: msg`Paste the serialized bytes of a document and name its contract and type to read its fields.`,
  },
  proof: {
    title: msg`Proof decoder`,
    about: msg`Paste a proof from a Platform answer to see the layers, the keys it proves and the hashes that stand in for the rest.`,
  },
  path: {
    title: msg`Path decoder`,
    about: msg`Read the elements stored at a GroveDB path, with a proof checked in this browser.`,
  },
}
