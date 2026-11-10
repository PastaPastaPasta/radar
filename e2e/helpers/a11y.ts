import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export interface AccessibleOptions {
  include?: string
  exclude?: string[]
  disableRules?: string[]
}

const BLOCKING = new Set(['serious', 'critical'])

interface AcceptedViolation {
  rule: string
  /** Selector path inside the vendored shell's shadow tree. */
  target: string[]
}

/**
 * The vendored dashhq shell is byte-identical to its release and has these axe findings of its own.
 * Each entry skips one rule on one element of the bar; the rest of the bar, and every other
 * element on the page, is still audited.
 */
const ACCEPTED_SHELL_VIOLATIONS: AcceptedViolation[] = [
  { rule: 'aria-prohibited-attr', target: ['dashhq-bar', '#dh-sheet'] },
  { rule: 'label-content-name-mismatch', target: ['dashhq-bar', '.switch'] },
  { rule: 'target-size', target: ['dashhq-bar', 'a[aria-label="dashhq.org home"]'] },
  { rule: 'target-size', target: ['dashhq-bar', '.product'] },
]

const isAccepted = (rule: string, target: unknown[]) =>
  ACCEPTED_SHELL_VIOLATIONS.some(
    (a) => a.rule === rule && JSON.stringify(a.target) === JSON.stringify(target.flat()),
  )

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
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => !isAccepted(v.id, n.target)) }))
    .filter((v) => v.nodes.length > 0)
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))

  expect(blocking, `serious or critical accessibility violations on ${page.url()}`).toEqual([])
}
