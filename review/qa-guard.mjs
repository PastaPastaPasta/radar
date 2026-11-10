import { appendFileSync } from 'node:fs'

const READ_ONLY = new Set(['GET', 'HEAD'])

const SEND_BODY =
  /broadcastStateTransition|broadcastTransaction|sendrawtransaction|sendtoaddress|sendmany|"method"\s*:\s*"send/i

export const RULES = [
  {
    name: 'dapi-broadcastStateTransition',
    test: ({ pathname, body, method }) =>
      /\/broadcastStateTransition\/?$/i.test(pathname) ||
      (!READ_ONLY.has(method) && /broadcastStateTransition/i.test(body)),
  },
  {
    name: 'broadcastTransaction',
    test: ({ pathname, body, method }) =>
      /\/broadcastTransaction\/?$/i.test(pathname) ||
      (!READ_ONLY.has(method) && /broadcastTransaction/i.test(body)),
  },
  {
    name: 'core-rpc-send',
    test: ({ body, method }) => !READ_ONLY.has(method) && SEND_BODY.test(body),
  },
  { name: 'insight-tx-send', test: ({ pathname }) => /\/tx\/send\/?$/i.test(pathname) },
  {
    name: 'pe-broadcast',
    test: ({ pathname }) =>
      /\/(transactions?|state-?transitions?|tx|stateTransitions?)\/(broadcast|send|submit)\/?$/i.test(
        pathname,
      ),
  },
  {
    name: 'broadcast-path',
    test: ({ pathname, method }) => !READ_ONLY.has(method) && /\/broadcast(\/|$)/i.test(pathname),
  },
]

export function matchBody(text) {
  return SEND_BODY.test(text)
}

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
  'input[type="search"]',
  'input[aria-label="Search Radar" i]',
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
    pathname = decodeURIComponent(pathname)
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

  await context.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => {
      if (
        !matchBody(typeof message === 'string' ? message : Buffer.from(message).toString('latin1'))
      ) {
        server.send(message)
        return
      }
      const entry = {
        time: new Date().toISOString(),
        rule: 'websocket-send',
        method: 'WS',
        url: ws.url(),
        page: null,
      }
      blocked.push(entry)
      if (logFile) appendFileSync(logFile, JSON.stringify(entry) + '\n')
      onBlock?.(entry)
      ws.close({ code: 1008, reason: 'blocked by review QA guard' })
    })
    server.onMessage((message) => ws.send(message))
    server.onClose((code, reason) => ws.close({ code, reason }))
    ws.onClose((code, reason) => server.close({ code, reason }))
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
