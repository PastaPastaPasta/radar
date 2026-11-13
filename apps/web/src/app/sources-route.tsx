import { SourcesPage } from '@/features/tools'
import { allDevnets, useDevnets } from './devnets'

/** The sources page with the saved devnets, whose node list may live at a configured address. */
export function SourcesRoute() {
  return <SourcesPage devnets={allDevnets(useDevnets())} />
}
