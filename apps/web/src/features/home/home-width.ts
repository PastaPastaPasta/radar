import { useMediaQuery } from '@/ui'

export type HomeWidth = 'phone' | 'tablet' | 'wide'

/** Which of the home's three trees to mount; each width has its own, so no CSS has to reorder them. */
export function useHomeWidth(): HomeWidth {
  const phone = useMediaQuery('(max-width: 640px)')
  const wide = useMediaQuery('(min-width: 1024px)')
  return phone ? 'phone' : wide ? 'wide' : 'tablet'
}
