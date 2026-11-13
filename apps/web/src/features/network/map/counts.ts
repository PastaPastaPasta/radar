import { plural } from '@lingui/core/macro'

/** "1 masternode", "12 masternodes": the noun phrase the headline, the cluster labels and the lists share. */
export const mnCount = (n: number): string =>
  plural(n, { one: '# masternode', other: '# masternodes' })

export const nodeCount = (n: number): string =>
  plural(n, { one: '# reachable node', other: '# reachable nodes' })
