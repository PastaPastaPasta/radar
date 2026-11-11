let resolved = false

/** Called once the router has committed its first location. */
export function markFirstLoadResolved(): void {
  resolved = true
}

/**
 * Runs a route loader's prefetch without holding the first paint. On the first load the shell and the
 * page's own pending state render at once and the prefetch runs on in the background; later
 * navigations and hover preloads keep their short await (§6.3).
 */
export function loadBehindFirstPaint(
  prefetch: (opts: { preload: boolean }) => Promise<void>,
  { preload }: { preload: boolean },
): Promise<void> | undefined {
  const first = !resolved && !preload
  const work = prefetch({ preload: preload || first })
  if (!first) return work
  work.catch(() => undefined)
  return undefined
}
