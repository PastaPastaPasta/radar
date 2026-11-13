/** What the root route's search adds to every route's search. */
export interface RouteSearch {
  network?: string | undefined
  net?: string | undefined
  sources?: string | undefined
}

export type NoParams = Record<never, never>
