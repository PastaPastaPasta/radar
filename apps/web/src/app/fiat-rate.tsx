import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { rateQueries } from '@/data/rate/queries'

/** Reads the USD rate and hands it up. Loaded only on mainnet with USD on, so the price client stays out of the entry chunk. */
export default function FiatRate({ onRate }: { onRate: (usdPerDash: number | undefined) => void }) {
  const usd = useQuery(rateQueries.usd()).data?.data.usd
  useEffect(() => {
    onRate(usd)
  }, [usd, onRate])
  useEffect(() => () => onRate(undefined), [onRate])
  return null
}
