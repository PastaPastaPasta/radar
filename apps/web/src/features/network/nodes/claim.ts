import { plural } from '@lingui/core/macro'

export const nodesClaim = (answered: number): string =>
  plural(answered, {
    one: '# masternode answered the last crawl',
    other: '# masternodes answered the last crawl',
  })
