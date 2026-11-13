import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

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

  test('translates the placeholder pages and their site-map titles @IN-13 @HY-15', async ({
    page,
  }) => {
    await page.goto('/settings')
    await page.getByRole('main').getByLabel('Language', { exact: true }).selectOption('ru')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.goto('/tokens')
    await expect(page.getByRole('heading', { level: 1, name: 'Токены' })).toBeVisible()
    await expect(page.getByText('Эта страница скоро появится')).toBeVisible()
    await expect(page.getByText('Откуда берутся данные')).toBeVisible()
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
