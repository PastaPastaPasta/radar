export type RouteNet = 'mainnet' | 'testnet'

/**
 * One URL the route sweep (`app-shell.spec.ts`) and the mode walk (`decentralized-mode.spec.ts`) visit.
 */
export interface RouteCase {
  /** The path with its query, as a link would carry it, without `network` or `sources`. */
  path: string
  /** The page's h1: a string matches as a substring, case-insensitively. */
  h1: string | RegExp
  /** Networks the path is valid on (it names a record that exists there). Absent: both. */
  nets?: RouteNet[]
  /** In Decentralized only mode: its own data only, data plus the unavailable state, or the unavailable state only. */
  decentralized: 'data' | 'partial' | 'unavailable'
  /** Something a built page reads over DAPI or the SDK and must still show in the mode (a CSS selector). */
  data?: string
}
