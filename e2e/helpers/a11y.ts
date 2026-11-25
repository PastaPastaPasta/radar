import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export interface AccessibleOptions {
  include?: string
  exclude?: string[]
  disableRules?: string[]
}

const BLOCKING = new Set(['serious', 'critical'])
const ENTRANCE_LIMIT_MS = 3000

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

interface AuditedNode {
  target: unknown[]
  any: { id: string; data?: unknown; relatedNodes?: { target: unknown[] }[] }[]
}

/**
 * A target that has scrolled part-way or wholly under the shell's sticky bar: axe measures what the
 * bar leaves of it, and its spacing against the bar's links. That is a scroll position, not the
 * target: the same targets further down the page are audited in full.
 */
const coveredByShellBar = (rule: string, node: AuditedNode, underBar: ReadonlySet<string>) =>
  rule === 'target-size' &&
  (underBar.has(JSON.stringify(node.target)) ||
    node.any.some(
      (check) =>
        (check.data as { messageKey?: string } | null)?.messageKey === 'partiallyObscured' &&
        !!check.relatedNodes?.length &&
        check.relatedNodes.every((r) => r.target.flat()[0] === 'dashhq-bar'),
    ))

/**
 * The page's targets that sit part-way or wholly under the shell's sticky bar: a list that opens at a
 * row past its first (`?page=2`) leaves the rows above it under the bar, and axe then measures what
 * the bar leaves of their targets against each other and the bar's links. The bar's own controls,
 * slotted ones included, are never exempt, and the same targets further down the page are still
 * audited at their full size.
 */
async function targetsUnderShellBar(page: Page, targets: unknown[][]): Promise<Set<string>> {
  const selectors = targets.filter((t) => t.length === 1 && typeof t[0] === 'string') as string[][]
  if (selectors.length === 0) return new Set()
  const under = await page.evaluate((list) => {
    const host = document.querySelector('dashhq-bar')
    const bar = host?.getBoundingClientRect()
    if (!host || !bar || bar.height === 0) return []
    return list.filter(([selector]) => {
      const el = document.querySelector(selector!)
      if (!el || host.contains(el)) return false
      const box = el.getBoundingClientRect()
      return box.top < bar.bottom && box.bottom > bar.top
    })
  }, selectors)
  return new Set(under.map((t) => JSON.stringify(t)))
}

/**
 * A figure that rolls in and a row that enters are part-transparent while they move, so an audit
 * taken mid-move reports a contrast the reader never sees. Looping animations are left running.
 */
async function entrancesFinished(page: Page): Promise<void> {
  await page.evaluate(
    (limit) =>
      Promise.race([
        Promise.allSettled(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished),
        ),
        new Promise((done) => setTimeout(done, limit)),
      ]).then(() => undefined),
    ENTRANCE_LIMIT_MS,
  )
}

export async function expectAccessible(page: Page, options: AccessibleOptions = {}): Promise<void> {
  await entrancesFinished(page)
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

  // A value that changes during the audit starts a fresh highlight; measure contrast at rest, not
  // mid-fade. The app's reduced-motion rule ends every animation at once, and the CSP forbids injecting one.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { violations } = await axe
    .analyze()
    .finally(() => page.emulateMedia({ reducedMotion: null }))
  const underBar = await targetsUnderShellBar(
    page,
    violations.filter((v) => v.id === 'target-size').flatMap((v) => v.nodes.map((n) => n.target)),
  )
  const blocking = violations
    .filter((v) => v.impact && BLOCKING.has(v.impact))
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter(
        (n) => !isAccepted(v.id, n.target) && !coveredByShellBar(v.id, n, underBar),
      ),
    }))
    .filter((v) => v.nodes.length > 0)
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))

  expect(blocking, `serious or critical accessibility violations on ${page.url()}`).toEqual([])
}
