import { plural } from '@lingui/core/macro'

export const nodesClaim = (answered: number): string =>
  plural(answered, {
    one: '# Dash node answered the last crawl',
    other: '# Dash nodes answered the last crawl',
  })
