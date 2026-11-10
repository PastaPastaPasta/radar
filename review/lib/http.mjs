const UA = 'radar-review-harness'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function getJson(url, { retries = 2, delayMs = 150, timeoutMs = 20000 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await sleep(delayMs)
      return await res.json()
    } catch (e) {
      lastError = e
      await sleep(500 * (attempt + 1))
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`)
}
