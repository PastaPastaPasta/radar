import type { Page } from '@playwright/test'

/**
 * Scrolls to the foot of the page, where a list that scrolls asks for its next page. A list loads only once the reader
 * has turned a wheel or pressed a key, never on a scroll the page makes itself, so the wheel turns too.
 */
export async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.mouse.wheel(0, 1)
}

/**
 * Scrolls until the list's end sentinel is just below the view, near enough to ask for the next page. The page that
 * comes then pushes it further away than the sentinel looks ahead, so one scroll reads one page, even a short one.
 */
export async function scrollNearEnd(page: Page, scope: string): Promise<void> {
  const sentinel = `${scope} [data-sentinel="end"]`
  await page.locator(sentinel).waitFor({ state: 'attached' })
  await page.evaluate((s) => {
    const el = document.querySelector(s)!
    window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight - 100)
  }, sentinel)
  await page.mouse.wheel(0, 1)
}

/**
 * Scrolls until the row sits at the top of the view, just under the sticky bar, so it is the first row the list sees
 * there and writes to the address. The view is made short first, so a list that has just loaded its second page does
 * not find its end near enough to ask for a third, which no recording holds.
 */
export async function scrollRowToTop(page: Page, selector: string): Promise<void> {
  const size = page.viewportSize()
  if (size && size.height > 600) await page.setViewportSize({ width: size.width, height: 600 })
  await page.locator(selector).first().waitFor({ state: 'attached' })
  await page.evaluate((s) => {
    const row = document.querySelector(s)!
    window.scrollBy(0, row.getBoundingClientRect().top - 40)
  }, selector)
}

/**
 * From the next load on, Platform Explorer's blocks list answers the pages past the recorded two with blocks made from
 * the second, older and with heights of their own, so a test can scroll as far as it likes.
 */
export async function synthesizePeBlockPages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : (input as Request).url, location.href)
      const n = Number(url.searchParams.get('page') ?? '1')
      if (!/\bapi\.pe\.dashhq\.org$/.test(url.hostname) || url.pathname !== '/blocks' || n <= 2) {
        return original(input, init)
      }
      const recorded = new URL(url)
      recorded.searchParams.set('page', '2')
      const answer = await original(recorded.toString(), init)
      const body = (await answer.json()) as {
        resultSet: { header: { height: number; hash: string } }[]
      }
      const limit = Number(url.searchParams.get('limit') ?? '25')
      for (const row of body.resultSet) {
        row.header.height -= (n - 2) * limit
        row.header.hash = row.header.height.toString(16).toUpperCase().padStart(64, '0')
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
  })
}

/**
 * From the next load on, the SDK answers the shielded pool's chunks past the recorded two with notes made from the
 * second, renumbered, so the notes list can scroll on without a recording for each chunk.
 */
export async function synthesizeShieldedChunks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Call = (net: unknown, method: string, args: unknown, signal?: unknown) => Promise<unknown>
    const w = window as unknown as Record<string, unknown>
    let held: { call: Call } | undefined
    Object.defineProperty(w, '__radarSdk', {
      configurable: true,
      get: () => held,
      set: (value: { call: Call }) => {
        held = value
        const real = value.call.bind(value)
        value.call = async (net, method, args, signal) => {
          const q = args as { startIndex?: number; count?: number }
          if (method !== 'shielded.encryptedNotes' || (q.startIndex ?? 0) <= 2048) {
            return real(net, method, args, signal)
          }
          const shift = (q.startIndex ?? 0) - 2048
          const answer = (await real(net, method, { ...q, startIndex: 2048 }, signal)) as {
            data: { index: number }[]
          }
          return { ...answer, data: answer.data.map((n) => ({ ...n, index: n.index + shift })) }
        }
      },
    })
  })
}
