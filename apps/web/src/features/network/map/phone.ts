export const PHONE = '(max-width: 900px)'
const WIDE = '(min-width: 900px)'

const matches = (query: string): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/** Phones and narrow windows: the controls are a bottom sheet and a masternode opens in it. */
export const isPhone = (): boolean => matches(PHONE)
export const isWide = (): boolean => matches(WIDE)
