import { i18n } from '@lingui/core'
import { resolvers } from './resolvers'

/** What the lookups that could not run would have found, in the language of the page. */
export function lookupNames(ids: string[]): string[] {
  const names = ids.flatMap((id) => {
    const what = resolvers.find((r) => r.id === id)?.what
    return what ? [i18n._(what)] : []
  })
  return [...new Set(names)]
}
