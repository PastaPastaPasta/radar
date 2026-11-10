import { appendFileSync } from 'node:fs'

const READ_ONLY = new Set(['GET', 'HEAD'])

export const RULES = [
  {
    name: 'dapi-broadcastStateTransition',
    test: ({ url, body }) => /broadcastStateTransition/i.test(url + body),
  },
  {
    name: 'broadcastTransaction',
    test: ({ url, body }) => /broadcastTransaction/i.test(url + body),
  },
  {
    name: 'core-rpc-send',
    test: ({ body }) =>
      /sendrawtransaction|sendtoaddress|sendmany|"method"\s*:\s*"send/i.test(body),
  },
  { name: 'insight-tx-send', test: ({ pathname }) => /\/tx\/send\/?$/i.test(pathname) },
  {
    name: 'pe-broadcast',
    test: ({ pathname, method }) =>
      !READ_ONLY.has(method) &&
      /\/(transactions?|state-?transitions?|tx|stateTransitions?)\/(broadcast|send|submit)\/?$/i.test(
        pathname,
      ),
  },
  {
    name: 'broadcast-path',
    test: ({ pathname, method }) => !READ_ONLY.has(method) && /\/broadcast(\/|$)/i.test(pathname),
  },
]

const SECRET_WORDS = [
  'mnemonic',
  'recovery',
  'seed',
  'private',
  'privkey',
  'wif',
  'secret',
  'passphrase',
  'backup',
]
const SECRET_ATTRS = ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'data-testid']

export const SECRET_SELECTOR = [
  'input[type="password"]',
  ...SECRET_WORDS.flatMap((w) => SECRET_ATTRS.map((a) => `:is(input, textarea)[${a}*="${w}" i]`)),
].join(', ')

function bodyOf(request) {
  try {
    const buf = request.postDataBuffer()
    return buf ? buf.toString('latin1') : ''
  } catch {
    return ''
  }
}

export function matchRule(request) {
  const url = request.url()
  let pathname = ''
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url
  }
  const info = { url, pathname, method: request.method().toUpperCase(), body: bodyOf(request) }
  return RULES.find((r) => r.test(info))?.name ?? null
}

function wrapScreenshot(page) {
  if (page.__qaGuardWrapped) return
  page.__qaGuardWrapped = true
  const original = page.screenshot.bind(page)
  page.screenshot = (options = {}) =>
    original({
      ...options,
      mask: [...(options.mask ?? []), page.locator(SECRET_SELECTOR)],
      maskColor: options.maskColor ?? '#000000',
    })
}

export async function installQaGuard(
  context,
  { logFile = process.env.QA_GUARD_LOG, onBlock } = {},
) {
  const blocked = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const rule = matchRule(request)
    if (!rule) return route.fallback()
    const entry = {
      time: new Date().toISOString(),
      rule,
      method: request.method(),
      url: request.url(),
      page: request.frame()?.page()?.url() ?? null,
    }
    blocked.push(entry)
    if (logFile) appendFileSync(logFile, JSON.stringify(entry) + '\n')
    onBlock?.(entry)
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'blocked by review QA guard', rule }),
    })
  })

  for (const page of context.pages()) wrapScreenshot(page)
  context.on('page', wrapScreenshot)

  return {
    blocked,
    async dispose() {
      await context.unroute('**/*')
    },
  }
}

export async function newGuardedContext(browser, options = {}, guardOptions = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options })
  const guard = await installQaGuard(context, guardOptions)
  return { context, guard }
}
