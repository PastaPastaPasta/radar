import { readFileSync } from 'node:fs'
import { perNet } from './fixtures'
import type { RouteCase, RouteNet } from './types'

interface DocEntity {
  contract: string
  type: string
  name: string
}

function docOf(net: RouteNet): DocEntity {
  const file = new URL(`../../review/fixtures/${net}.json`, import.meta.url)
  const entities =
    (
      JSON.parse(readFileSync(file, 'utf8')) as {
        entities?: Record<string, Record<string, unknown>>
      }
    ).entities ?? {}
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
  return {
    contract: text(entities.doc?.contract, 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'),
    type: text(entities.doc?.type, 'domain'),
    name: text(entities.name_registered?.id, 'dash'),
  }
}

const TABS = [
  'schema',
  'types',
  'tokens',
  'groups',
  'history',
  'config',
  'transactions',
  'documents',
] as const

export const pData: RouteCase[] = [
  { path: '/contracts', h1: 'Contracts', decentralized: 'unavailable' },
  {
    path: '/contracts?sort=-docs&tokens=1',
    h1: 'Contracts',
    decentralized: 'unavailable',
  },
  ...perNet((ids) => {
    const contract = ids.id('contract', '0')
    const doc = docOf(ids.net)
    const group = ids.group()
    const docId = ids.id('doc', '0')
    const where = `normalizedParentDomainName~eq~dash,normalizedLabel~sw~${doc.name}`
    return [
      { path: `/contract/${contract}`, h1: 'Contract', decentralized: 'partial' },
      ...TABS.map((tab): RouteCase => ({
        path: `/contract/${contract}?tab=${tab}`,
        h1: 'Contract',
        decentralized: tab === 'transactions' || tab === 'documents' ? 'unavailable' : 'data',
      })),
      {
        path: `/contract/${doc.contract}/documents/${doc.type}`,
        h1: 'Documents',
        decentralized: 'data',
      },
      {
        path: `/contract/${doc.contract}/documents/${doc.type}?where=${where}`,
        h1: 'Documents',
        decentralized: 'data',
      },
      {
        path: `/document/${doc.contract}/${doc.type}/${docId}`,
        h1: 'Document',
        decentralized: 'data',
      },
      { path: `/groups/${group.contract}`, h1: 'Groups', decentralized: 'data' },
      {
        path: `/group/${group.contract}/${group.position}`,
        h1: 'Group',
        decentralized: 'data',
      },
    ]
  }),
]
