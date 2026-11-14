import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { casesNets, networkQuery, ROUTE_CASES, withQuery } from '../routes'

const LANGUAGES = [
  'English',
  'Deutsch',
  'Français',
  'Español',
  'Português',
  '日本語',
  '简体中文',
  'Русский',
  'Türkçe',
  'Українська',
]

test.describe('language', () => {
  test('offers all ten languages in settings @IN-13 @HY-15', async ({ page }) => {
    await page.goto('/settings')
    const select = page.getByRole('main').getByLabel('Language', { exact: true })
    await expect(select.locator('option')).toHaveText(LANGUAGES)
  })

  test('switches the page, the document language and the choice for next time @IN-13', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.getByRole('main').getByLabel('Language', { exact: true }).selectOption('de')

    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByRole('main').getByLabel('Sprache', { exact: true })).toHaveValue('de')
  })

  test('switches back to English @IN-13', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('main').getByLabel('Language', { exact: true }).selectOption('fr')
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible()
    await page.getByRole('main').getByLabel('Langue', { exact: true }).selectOption('en')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('has the same control in the footer of every page, and it re-renders the page in place @IN-13 @HY-15', async ({
    page,
  }) => {
    await page.goto('/blocks')
    const footer = page.locator('dashhq-footer').getByLabel('Language', { exact: true })
    await expect(footer.locator('option')).toHaveText(LANGUAGES)
    await expect(page.getByRole('heading', { level: 1, name: 'Blocks' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()

    await footer.selectOption('de')

    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByRole('heading', { level: 1, name: 'Blöcke' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Einstellungen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
    await expect(page.locator('[data-section-nav]')).toBeVisible()
  })

  test('translates a page and its site-map title @IN-13 @HY-15', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('main').getByLabel('Language', { exact: true }).selectOption('ru')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.goto('/tokens')
    await expect(page.getByRole('heading', { level: 1, name: 'Токены' })).toBeVisible()
    await expect(page).toHaveTitle(/Токены/)
    await expectAccessible(page)
  })

  test('keeps a translated page translated while navigating @IN-13', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('main').getByLabel('Language', { exact: true }).selectOption('es')
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible()
    await page.goto('/search?q=zzzz-not-a-real-core-thing-12345')
    await expect(page.getByRole('heading', { level: 1, name: 'Buscar' })).toBeVisible()
  })
})

test.describe('Russian', () => {
  test.use({ locale: 'ru-RU' })

  test('follows the browser language on a first visit @HY-15', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
    await expect(page.getByRole('main').getByLabel('Язык', { exact: true })).toHaveValue('ru')
    await expectAccessible(page)
  })

  test('translates search, and a nonsense search says nothing matched @IN-13 @HY-15', async ({
    page,
  }) => {
    await page.goto('/search?q=zzzz-not-a-real-core-thing-12345')
    await expect(page.getByRole('heading', { level: 1, name: 'Поиск' })).toBeVisible()
    await expect(page.getByText(/Нет совпадений/)).toBeVisible()
    await expectAccessible(page)
  })
})

test.describe('Chinese', () => {
  test.use({ locale: 'zh-CN' })

  test('follows the browser language on a first visit @IN-13 @HY-15', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
    await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible()
    await expect(page.getByRole('main').getByLabel('语言', { exact: true })).toHaveValue('zh')
    await expectAccessible(page)
  })

  test('translates search @IN-13 @HY-15', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { level: 1, name: '搜索' })).toBeVisible()
    await expect(page.getByRole('searchbox')).toBeVisible()
    await expectAccessible(page)
  })
})

const ENGLISH_WORDS = new Set(
  'the of and to is for this that with from are not or it be was has have your you can no when which by an as at will they their these those than then there here only into out about after before over under until while'.split(
    ' ',
  ),
)

/**
 * Visible text runs that read as English: three or more words, a fifth or more of them English function words. What a
 * contract's author or a miner wrote stays as written (`translate="no"`), and SQL and JSON are not prose.
 */
function englishRuns(page: Page): Promise<string[]> {
  return page.evaluate(
    (english) => {
      const words = new Set(english)
      const skip = 'script, style, code, pre, kbd, samp, [data-json-view], [translate="no"]'
      const found = new Set<string>()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement
        if (!el || el.closest(skip)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) continue
        const tokens = text.toLowerCase().match(/[a-z']+/g) ?? []
        if (tokens.length < 3) continue
        const hits = tokens.filter((w) => words.has(w))
        if (new Set(hits).size >= 2 && hits.length / tokens.length >= 0.2) found.add(text)
      }
      return [...found]
    },
    [...ENGLISH_WORDS],
  )
}

for (const [locale, name] of [
  ['de-DE', 'German'],
  ['ja-JP', 'Japanese'],
] as const) {
  test.describe(`every route in ${name}`, () => {
    test.use({ locale })

    for (const route of ROUTE_CASES) {
      const net = casesNets(route)[0]!
      test(`${net} ${route.path} has no hard-coded English @IN-13 @HY-15`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-light', 'one project reads the page')
        await page.goto(withQuery(route.path, networkQuery(net)))
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await settled(page)
        expect(await englishRuns(page), 'English text on a translated page').toEqual([])
      })
    }
  })
}
