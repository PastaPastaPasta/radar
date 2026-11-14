import { expect, test as base } from '@playwright/test'

export { expect } from '@playwright/test'

const FIXTURE_ERROR_PREFIX = '[radar-fixtures]'

/**
 * Trusted Types is report-only. These two third-party sinks are all that remains: the MSW worker
 * registration (fixture mode only, see check:bundle) and echarts' own `innerHTML` writes. Any other
 * report fails the test.
 */
const KNOWN_TRUSTED_TYPES_SINKS = [
  { source: /\/assets\/browser-[\w-]+\.js:/, sample: 'ServiceWorkerContainer register|' },
  { source: /\/assets\/chart-view-[\w-]+\.js:/, sample: 'Element innerHTML|' },
]

const isKnownSink = (v: Violation) =>
  v.disposition === 'report' &&
  v.directive === 'require-trusted-types-for' &&
  KNOWN_TRUSTED_TYPES_SINKS.some((k) => k.source.test(v.source) && v.sample.startsWith(k.sample))

interface Violation {
  disposition: string
  directive: string
  blocked: string
  source: string
  sample: string
}

const describeViolation = (v: Violation) =>
  `${v.directive} blocked ${v.blocked || 'inline'} at ${v.source}${v.sample ? ` (${v.sample})` : ''}`

export const test = base.extend<{ allowFixtureMisses: boolean }>({
  /**
   * A spec that fails a source on purpose sets this: the page then reads from fallbacks nobody recorded, and the
   * fixture layer refuses them with a network failure, the same as the source being down.
   */
  allowFixtureMisses: [false, { option: true }],
  context: async ({ context, baseURL, colorScheme, allowFixtureMisses }, use) => {
    if (baseURL) {
      await context.addCookies([
        { name: 'dh_theme', value: colorScheme === 'dark' ? 'dark' : 'light', url: baseURL },
      ])
    }

    const violations: string[] = []
    await context.exposeBinding('__radarCspViolation', (_source, v: Violation) => {
      if (isKnownSink(v)) return
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
    if (!allowFixtureMisses) expect(fixtureErrors, 'requests with no recorded fixture').toEqual([])
  },
})
