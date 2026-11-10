const REGION_ID = 'rx-announcer'
const lastSent = new Map<string, number>()

function region(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById(REGION_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = REGION_ID
    el.className = 'dh-sr'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    document.body.appendChild(el)
  }
  return el
}

export interface AnnounceOptions {
  /** Messages sharing a key are sent at most once per `throttleMs`. */
  key?: string
  throttleMs?: number
}

/** One polite live region per page: copy confirmations, new blocks, sort and filter result counts. */
export function announce(message: string, options: AnnounceOptions = {}): void {
  const el = region()
  if (!el) return
  if (options.key && options.throttleMs) {
    const now = Date.now()
    const last = lastSent.get(options.key)
    if (last !== undefined && now - last < options.throttleMs) return
    lastSent.set(options.key, now)
  }
  el.textContent = ''
  window.setTimeout(() => {
    el.textContent = message
  }, 30)
}

export function resetAnnouncer(): void {
  lastSent.clear()
  document.getElementById(REGION_ID)?.remove()
}
