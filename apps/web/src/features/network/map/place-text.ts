import { countryName } from '../nodes/census-format'

/** "Falkenstein, Germany"; a city named like its country is named once ("Singapore"). */
export function placeText(p: { city?: string | null; country?: string | null }): string {
  const country = p.country ? countryName(p.country) : undefined
  return [p.city, country === p.city ? undefined : country].filter(Boolean).join(', ')
}
