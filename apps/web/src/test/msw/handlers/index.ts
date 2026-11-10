import type { AnyHandler } from 'msw'
import { hyphenHandlers, peHandlers, radarHandlers } from './fixtures'

export { takeFixtureMisses } from './fixtures'

export const fixtureHandlers: AnyHandler[] = [...radarHandlers, ...peHandlers, ...hyphenHandlers]
