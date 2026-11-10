import { setupServer } from 'msw/node'
import type { AnyHandler } from 'msw'

export const handlers: AnyHandler[] = []

export const server = setupServer(...handlers)
