import type { ReactNode } from 'react'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'

/** Renders a component with the app's i18n and a router whose address is `initial`, e.g. `/?network=testnet`. */
export function renderInApp(node: ReactNode, initial = '/') {
  return renderInRouter(<I18nProvider i18n={i18n}>{node}</I18nProvider>, initial)
}
