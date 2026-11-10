import { expect, test as base } from '@playwright/test'

export { expect } from '@playwright/test'

const FIXTURE_ERROR_PREFIX = '[radar-fixtures]'

/** Trusted Types is only reported (never enforced) by the report-only header. */
const REPORT_ONLY_DIRECTIVES = new Set(['require-trusted-types-for', 'trusted-types'])

interface Violation {
  disposition: string
  directive: string
  blocked: string
  source: string
  sample: string
}

const describeViolation = (v: Violation) =>
  `${v.directive} blocked ${v.blocked || 'inline'} at ${v.source}${v.sample ? ` (${v.sample})` : ''}`

export const test = base.extend({
  context: async ({ context, baseURL, colorScheme }, use) => {
    if (baseURL) {
      await context.addCookies([
        { name: 'dh_theme', value: colorScheme === 'dark' ? 'dark' : 'light', url: baseURL },
      ])
    }

    const violations: string[] = []
    await context.exposeBinding('__radarCspViolation', (_source, v: Violation) => {
      if (v.disposition === 'report' && REPORT_ONLY_DIRECTIVES.has(v.directive)) return
      violations.push(`${v.disposition} ${describeViolation(v)}`)
    })
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        const report = (window as unknown as Record<string, (v: Violation) => void>)
          .__radarCspViolation
        report?.({
          disposition: e.disposition,
          directive: e.effectiveDirective,
          blocked: e.blockedURI,
          source: `${e.sourceFile}:${e.lineNumber}`,
          sample: e.sample,
        })
      })
    })

    const fixtureErrors: string[] = []
    context.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().startsWith(FIXTURE_ERROR_PREFIX)) {
        fixtureErrors.push(msg.text())
      }
    })

    await use(context)

    expect(violations, 'content security policy violations').toEqual([])
    expect(fixtureErrors, 'requests with no recorded fixture').toEqual([])
  },
})
