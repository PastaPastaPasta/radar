import { queryOptions } from '@tanstack/react-query'
import { rateKeys } from '../query/keys'
import { dataClass } from '../query/stale'
import { rate } from './client'

export const rateQueries = {
  usd: () =>
    queryOptions({
      queryKey: rateKeys('mainnet', 'usd'),
      queryFn: ({ signal }) => rate.usd(signal),
      ...dataClass('rate'),
    }),
}
