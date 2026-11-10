import type { Browser, BrowserContext, BrowserContextOptions, Request } from '@playwright/test'

export interface BlockedCall {
  time: string
  rule: string
  method: string
  url: string
  page: string | null
}

export interface GuardOptions {
  logFile?: string
  onBlock?: (entry: BlockedCall) => void
}

export interface Guard {
  blocked: BlockedCall[]
  dispose(): Promise<void>
}

export const RULES: { name: string }[]
export const SECRET_SELECTOR: string
export function matchBody(text: string): boolean
export function matchRule(
  request: Pick<Request, 'url' | 'method' | 'postDataBuffer'>,
): string | null
export function installQaGuard(context: BrowserContext, options?: GuardOptions): Promise<Guard>
export function newGuardedContext(
  browser: Browser,
  options?: BrowserContextOptions,
  guardOptions?: GuardOptions,
): Promise<{ context: BrowserContext; guard: Guard }>
