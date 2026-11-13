import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetUpdate, updateOffer } from '@/features/you/update/update-state'
import { registerServiceWorker, SW_FLAG_KEY } from './sw-register'

class FakeWorker extends EventTarget {
  state = 'installed'
  readonly messages: unknown[] = []
  constructor(readonly scriptURL: string) {
    super()
  }
  postMessage(message: unknown) {
    this.messages.push(message)
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  update = vi.fn(() => Promise.resolve())
}

class FakeContainer extends EventTarget {
  controller: object | null = {}
  registration = new FakeRegistration()
  readonly registered: { url: string; options: unknown }[] = []
  register(url: string, options: unknown) {
    this.registered.push({ url: String(url), options })
    return Promise.resolve(this.registration)
  }
  getRegistrations() {
    return Promise.resolve([])
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

let container: FakeContainer
const asContainer = () => container as unknown as ServiceWorkerContainer

beforeEach(() => {
  container = new FakeContainer()
  resetUpdate()
  localStorage.removeItem(SW_FLAG_KEY)
})
afterEach(() => {
  resetUpdate()
  localStorage.removeItem(SW_FLAG_KEY)
})

describe('registerServiceWorker', () => {
  it('registers nothing in a dev or test build unless the flag is on', async () => {
    registerServiceWorker({ container: asContainer() })
    await flush()
    expect(container.registered).toEqual([])
  })

  it('registers the worker under this build’s version, outside the HTTP cache', async () => {
    registerServiceWorker({ container: asContainer(), enabled: true, version: 'abc123' })
    await flush()
    expect(container.registered).toHaveLength(1)
    expect(container.registered[0]?.url).toMatch(/\/sw\.js\?v=abc123$/)
    expect(container.registered[0]?.options).toEqual({ scope: '/', updateViaCache: 'none' })
  })

  it('is on when the flag says so, and off when it says off', async () => {
    localStorage.setItem(SW_FLAG_KEY, 'on')
    registerServiceWorker({ container: asContainer(), version: 'a' })
    await flush()
    expect(container.registered).toHaveLength(1)
    localStorage.setItem(SW_FLAG_KEY, 'off')
    registerServiceWorker({ container: asContainer(), enabled: undefined, version: 'a' })
    await flush()
    expect(container.registered).toHaveLength(1)
  })

  it('offers a reload when a different build is waiting, and switches only when asked', async () => {
    const reload = vi.fn()
    registerServiceWorker({ container: asContainer(), enabled: true, version: 'old', reload })
    await flush()
    const next = new FakeWorker('https://radar.test/sw.js?v=new')
    container.registration.installing = next
    container.registration.dispatchEvent(new Event('updatefound'))
    next.dispatchEvent(new Event('statechange'))
    expect(updateOffer()).toBeDefined()
    expect(next.messages).toEqual([])

    updateOffer()!.apply()
    expect(next.messages).toEqual([{ type: 'skip-waiting' }])
    expect(reload).not.toHaveBeenCalled()
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('takes over quietly when the waiting worker is this page’s own build', async () => {
    registerServiceWorker({ container: asContainer(), enabled: true, version: 'same' })
    await flush()
    const next = new FakeWorker('https://radar.test/sw.js?v=same')
    container.registration.waiting = next
    container.registration.installing = next
    container.registration.dispatchEvent(new Event('updatefound'))
    next.dispatchEvent(new Event('statechange'))
    expect(updateOffer()).toBeUndefined()
    expect(next.messages).toEqual([{ type: 'skip-waiting' }])
  })

  it('offers nothing on the first install, when no worker controls the page yet', async () => {
    container.controller = null
    registerServiceWorker({ container: asContainer(), enabled: true, version: 'a' })
    await flush()
    const first = new FakeWorker('https://radar.test/sw.js?v=a')
    container.registration.installing = first
    container.registration.dispatchEvent(new Event('updatefound'))
    first.dispatchEvent(new Event('statechange'))
    expect(updateOffer()).toBeUndefined()
    expect(first.messages).toEqual([])
  })
})
