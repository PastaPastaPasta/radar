import type { BrowserContext } from '@playwright/test'
import { installQaGuard } from '../../review/qa-guard.mjs'

export interface BlockedCall {
  time: string
  rule: string
  method: string
  url: string
  page: string | null
}

export async function guardContext(context: BrowserContext): Promise<{ blocked: BlockedCall[] }> {
  return installQaGuard(context)
}
