import { i18n } from '@lingui/core'
import { useRouterState, type LinkProps } from '@tanstack/react-router'
import { Tabs } from '@/ui'
import { findPage, pageTitle, SITE_GROUPS, type SiteGroup } from './site-map'

export interface PageGroupTabsProps {
  group: SiteGroup
}

/** Link tabs to the pages of one rail group, placed under the page's `h1`. */
export function PageGroupTabs({ group }: PageGroupTabsProps) {
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId ?? '' })
  const tabs = SITE_GROUPS[group].pages.map((path) => {
    const page = findPage(path)
    const label = page ? (page.railTitle ? i18n._(page.railTitle) : pageTitle(page)) : path
    return { id: path, label }
  })
  const current = findPage(routeId)?.path ?? ''
  return <Tabs tabs={tabs} value={current} to={(to) => ({ to }) as LinkProps} layer="platform" />
}
