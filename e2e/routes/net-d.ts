import type { RouteCase } from './types'

export const netD: RouteCase[] = [
  { path: '/map', h1: 'Map', built: false, decentralized: 'partial' },
  { path: '/map?layer=nodes&color=version', h1: 'Map', built: false, decentralized: 'partial' },
  { path: '/changes', h1: 'Changes', built: false, decentralized: 'unavailable' },
  { path: '/changes?kind=pose', h1: 'Changes', built: false, decentralized: 'unavailable' },
  { path: '/api', h1: 'Radar API', built: false, decentralized: 'data' },
]
