import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zCsvEnum, zDefault, zIsoDate, zLimit, zOpt, zPage, zRange } from '@/app/search'
import { TransitionsPage } from '@/features/platform'

const defaults = { page: 1, limit: 25, sort: '-time' } as const

const platformTxsSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  type: zOpt(
    zCsvEnum([
      'data-contract-create',
      'data-contract-update',
      'batch',
      'identity-create',
      'identity-top-up',
      'identity-update',
      'identity-credit-transfer',
      'identity-credit-withdrawal',
      'masternode-vote',
      'address-funds-transfer',
      'address-funding-from-asset-lock',
      'address-credit-withdrawal',
      'shielded',
    ]),
  ),
  batch: zOpt(zCsv),
  status: zOpt(z.enum(['success', 'fail'])),
  gas: zOpt(zRange),
  owner: zOpt(z.string()),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
  sort: zDefault(z.string(), defaults.sort),
})

export const Route = createFileRoute('/platform/txs')({
  validateSearch: platformTxsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-blocks'),
    (m) => m.platformTxsPrefetch,
  ),
  component: TransitionsPage,
})
