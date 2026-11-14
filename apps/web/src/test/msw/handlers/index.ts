import type { AnyHandler } from 'msw'
import { hyphenHandlers, insightHandlers, peHandlers, radarHandlers } from './fixtures'

export { HTTP_SOURCE_PATTERNS, onFixtureMiss, takeFixtureMisses } from './fixtures'

export const fixtureHandlers: AnyHandler[] = [
  ...radarHandlers,
  ...peHandlers,
  ...hyphenHandlers,
  ...insightHandlers,
]
