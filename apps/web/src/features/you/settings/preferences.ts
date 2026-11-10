const UTC_KEY = 'radar.utc'

export function writeUtcPreference(utc: boolean): void {
  try {
    if (utc) globalThis.localStorage?.setItem(UTC_KEY, '1')
    else globalThis.localStorage?.removeItem(UTC_KEY)
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
}
