import type { Messages } from '@lingui/core'

const catalogs = import.meta.glob<{ messages: Messages }>('./*.po', { eager: true })

/** Every catalog of the locale, merged: `messages.po` and one per package (ARCHITECTURE §9.1). */
export const messages: Messages = Object.assign(
  {},
  ...Object.values(catalogs).map((c): Messages => c.messages),
) as Messages
