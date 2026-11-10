import { locateFixture } from './slug'

export interface HttpFixture {
  request: { method: string; url: string }
  recordedAt: string
  status: number
  headers: Record<string, string>
  body: unknown
  trimmed?: string
}

const jsonFiles = import.meta.glob<HttpFixture>('./http/*/*/*.json', { import: 'default' })
const textFiles = import.meta.glob<string>('./http/*/*/*.ndjson', {
  query: '?raw',
  import: 'default',
})

const key = (source: string, net: string, slug: string, ext: string) =>
  `./http/${source}/${net}/${slug}.${ext}`

export async function loadHttpFixture(url: string, method = 'GET'): Promise<HttpFixture | null> {
  const loc = locateFixture(url, method)
  if (!loc) return null
  const load = jsonFiles[key(loc.source, loc.net, loc.slug, 'json')]
  return load ? load() : null
}

export async function loadStreamFixture(url: string): Promise<string | null> {
  const loc = locateFixture(url)
  if (loc?.path !== '/stream') return null
  const load = textFiles[key(loc.source, loc.net, 'stream', 'ndjson')]
  return load ? load() : null
}

export async function fixture(source: string, net: string, slug: string): Promise<HttpFixture> {
  const load = jsonFiles[key(source, net, slug, 'json')]
  if (!load) throw new Error(`No fixture ${source}/${net}/${slug}.json`)
  return load()
}

/** Fixture bodies by `<source>/<net>/<slug>`, for tests that read a recording directly. */
export async function fixtureBody<T = unknown>(
  source: string,
  net: string,
  slug: string,
): Promise<T> {
  return (await fixture(source, net, slug)).body as T
}

export async function streamLines(source: string, net: string): Promise<string[]> {
  const load = textFiles[key(source, net, 'stream', 'ndjson')]
  if (!load) throw new Error(`No stream fixture ${source}/${net}`)
  return (await load()).trim().split('\n')
}

export function listFixtures(source: string, net: string): string[] {
  const prefix = `./http/${source}/${net}/`
  return Object.keys(jsonFiles)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length, -'.json'.length))
}
