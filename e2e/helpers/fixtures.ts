import type { Page } from '@playwright/test'

/**
 * From the next page load on, the fixture DAPI transport answers `txid` as a transaction still in the mempool
 * (`FIXTURE_UNMINED_KEY` in `apps/web/src/test/msw/browser.ts`). Recordings hold mined transactions only.
 */
export async function answerAsUnmined(
  page: Page,
  txid: string,
  opts: { instantLocked: boolean },
): Promise<void> {
  await page.addInitScript(
    ([id, o]) => {
      const key = 'radar.fixture.unmined'
      const known = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>
      sessionStorage.setItem(key, JSON.stringify({ ...known, [id]: o }))
    },
    [txid, opts] as const,
  )
}

/**
 * From the next page load on, DAPI's masternode list leaves `protx` out, as for a masternode that has left the list
 * since the recording (`FIXTURE_LEFT_KEY` in `apps/web/src/test/msw/browser.ts`).
 */
export async function answerAsLeftList(page: Page, protx: string): Promise<void> {
  await page.addInitScript((id) => {
    const key = 'radar.fixture.mn-left'
    const known = JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]
    sessionStorage.setItem(key, JSON.stringify([...known, id]))
  }, protx)
}
