import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export interface AccessibleOptions {
  include?: string
  exclude?: string[]
  disableRules?: string[]
}

const BLOCKING = new Set(['serious', 'critical'])

export async function expectAccessible(page: Page, options: AccessibleOptions = {}): Promise<void> {
  let axe = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ])
  if (options.include) axe = axe.include(options.include)
  for (const selector of options.exclude ?? []) axe = axe.exclude(selector)
  if (options.disableRules?.length) axe = axe.disableRules(options.disableRules)

  const { violations } = await axe.analyze()
  const blocking = violations
    .filter((v) => v.impact && BLOCKING.has(v.impact))
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))

  expect(blocking, `serious or critical accessibility violations on ${page.url()}`).toEqual([])
}
