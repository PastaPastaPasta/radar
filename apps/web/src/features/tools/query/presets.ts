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

/** A name and an owner that exist on each network, so a preset returns something to read. */
const EXAMPLES: Record<'mainnet' | 'testnet', { label: string; owner: string | undefined }> = {
  mainnet: { label: 'pshenm1c', owner: '9dQixko1C7TrmKYuZDZ8qAhgMQWT5fZ3tvyb13MVnQV6' },
  testnet: { label: 'therea1s11mshaddy5', owner: undefined },
}

/** Testnet contracts with summable and averageable indexes; no mainnet contract has a countable index yet. */
const RELEASES = '5ofyNoMo8YriuoEFW4aTt1vkhyecurXso1Yyif324rfV'
const GRADES = '7DiE1W5YYgUXx7s68YTMGEM9UssZ5TFg7dXdGaDj8cet'

/** The starting queries: a name by label, profiles, and on testnet a sum and a grouped average. */
export function queryPresets(net: NetworkId): QueryPreset[] {
  const example =
    net === 'mainnet' || net === 'testnet' ? EXAMPLES[net] : { label: 'alice', owner: undefined }
  const dpns = systemContract('dpns').id
  const dashpay = systemContract('dashpay').id
  const presets: QueryPreset[] = [
    {
      id: 'dpns-label',
      title: msg`A name by its label`,
      contractId: dpns,
      sql: `SELECT * FROM domain\nWHERE normalizedParentDomainName == 'dash'\n  AND normalizedLabel == '${example.label}'\nLIMIT 5`,
    },
    example.owner
      ? {
          id: 'dashpay-owner',
          title: msg`DashPay profiles of one owner`,
          contractId: dashpay,
          sql: `SELECT * FROM profile\nWHERE $ownerId == '${example.owner}'\nLIMIT 10`,
        }
      : {
          id: 'dashpay-profiles',
          title: msg`The first DashPay profiles`,
          contractId: dashpay,
          sql: 'SELECT * FROM profile\nLIMIT 5',
        },
  ]
  if (net === 'testnet') {
    presets.push(
      {
        id: 'sum',
        title: msg`A sum over a range`,
        contractId: RELEASES,
        sql: `SELECT SUM(delta) FROM release\nWHERE repoId == '4Gi9cEwBkN1iGUBGqKcewJhj2TfKy94TTTkLLbM4cc1R'\n  AND tagName > 'a'\nORDER BY tagName ASC`,
      },
      {
        id: 'group-by',
        title: msg`An average per group`,
        contractId: GRADES,
        sql: `SELECT AVG(score) FROM grade\nWHERE class == 'CS101'\n  AND semester BETWEEN 20241 AND 20262\nGROUP BY semester\nORDER BY semester ASC`,
      },
    )
  }
  return presets
}
