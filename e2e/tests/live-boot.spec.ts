import { expectAccessible } from '../helpers/a11y'
import { guardContext } from '../helpers/qa-guard'
import { expect, test } from '../helpers/test'

test('live build boots under the production headers @live', async ({ page, context }) => {
  const guard = await guardContext(context)
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text()))
      problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(e.message))

  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'")
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expectAccessible(page)

  expect(problems).toEqual([])
  expect(guard.blocked).toEqual([])
})
