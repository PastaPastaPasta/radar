import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pData: RouteCase[] = [
  { path: '/contracts', h1: 'Contracts', built: false, decentralized: 'unavailable' },
  ...perNet((ids) => {
    const contract = ids.id('contract', '0')
    const group = ids.group()
    return [
      { path: `/contract/${contract}`, h1: 'Contract', built: false, decentralized: 'partial' },
      {
        path: `/contract/${contract}/documents/domain`,
        h1: 'Documents',
        built: false,
        decentralized: 'data',
      },
      {
        path: `/document/${contract}/domain/${ids.id('doc', '0')}`,
        h1: 'Document',
        built: false,
        decentralized: 'data',
      },
      { path: `/groups/${group.contract}`, h1: 'Groups', built: false, decentralized: 'data' },
      {
        path: `/group/${group.contract}/${group.position}`,
        h1: 'Group',
        built: false,
        decentralized: 'data',
      },
    ]
  }),
]
