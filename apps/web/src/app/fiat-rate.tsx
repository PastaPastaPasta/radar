import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { stampOf } from '@/data/envelope'
import { rateQueries } from '@/data/rate/queries'
import type { RateInfo } from '@/ui/units-context'

export interface FiatRateValue extends RateInfo {
  usd: number
}

/** Reads the USD rate and hands it up. Loaded only on mainnet with USD in use, so the price client stays out of the entry chunk. */
export default function FiatRate({
  onRate,
}: {
  onRate: (rate: FiatRateValue | undefined) => void
}) {
  const query = useQuery(rateQueries.usd()).data
  useEffect(() => {
    onRate(
      query
        ? { usd: query.data.usd, provider: query.data.provider, stamp: stampOf(query) }
        : undefined,
    )
  }, [query, onRate])
  useEffect(() => () => onRate(undefined), [onRate])
  return null
}
