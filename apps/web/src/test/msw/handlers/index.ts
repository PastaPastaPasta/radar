import type { AnyHandler } from 'msw'
import { hyphenHandlers, peHandlers, radarHandlers } from './fixtures'

export { onFixtureMiss, takeFixtureMisses } from './fixtures'

export const fixtureHandlers: AnyHandler[] = [...radarHandlers, ...peHandlers, ...hyphenHandlers]
