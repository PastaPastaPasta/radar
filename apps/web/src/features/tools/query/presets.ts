import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { systemContract } from '@/lib/well-known'
import type { NetworkId } from '@/lib/network'

export interface QueryPreset {
  id: string
  title: MessageDescriptor
  sql: string
  /** The contract the picker takes when the preset loads. */
  contractId: string
}

/** A name and an identity that exist on each network, so a preset returns something to read. */
const EXAMPLES: Record<'mainnet' | 'testnet', { label: string; owner: string }> = {
  mainnet: { label: 'pshenm1c', owner: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp' },
  testnet: {
    label: 'therea1s11mshaddy5',
    owner: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
  },
}

const SYSTEM_OWNER = '11111111111111111111111111111111'

/** The starting queries: a document lookup by name, one by owner, a total and a grouped count. */
export function queryPresets(net: NetworkId): QueryPreset[] {
  const example =
    net === 'mainnet' || net === 'testnet' ? EXAMPLES[net] : { label: 'alice', owner: SYSTEM_OWNER }
  const dpns = systemContract('dpns').id
  const dashpay = systemContract('dashpay').id
  return [
    {
      id: 'dpns-label',
      title: msg`A name by its label`,
      contractId: dpns,
      sql: `SELECT * FROM domain\nWHERE normalizedParentDomainName == 'dash'\n  AND normalizedLabel == '${example.label}'\nLIMIT 5`,
    },
    {
      id: 'dashpay-owner',
      title: msg`DashPay profiles of one owner`,
      contractId: dashpay,
      sql: `SELECT * FROM profile\nWHERE $ownerId == '${example.owner}'\nLIMIT 10`,
    },
    {
      id: 'count',
      title: msg`How many names there are`,
      contractId: dpns,
      sql: `SELECT COUNT(*) FROM domain\nWHERE normalizedParentDomainName == 'dash'`,
    },
    {
      id: 'group-by',
      title: msg`Names per top-level domain`,
      contractId: dpns,
      sql: `SELECT COUNT(*) FROM domain\nWHERE normalizedParentDomainName IN ('dash')\nGROUP BY normalizedParentDomainName\nORDER BY normalizedParentDomainName ASC`,
    },
  ]
}
