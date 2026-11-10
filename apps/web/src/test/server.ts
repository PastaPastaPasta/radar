import { setupServer } from 'msw/node'
import type { AnyHandler } from 'msw'
import { fixtureHandlers } from './msw/handlers'

export const handlers: AnyHandler[] = [...fixtureHandlers]

export const server = setupServer(...handlers)
