import { createRequire } from 'node:module'

const require = createRequire(new URL('../../e2e/package.json', import.meta.url))
const pw = require('@playwright/test')

export const chromium = pw.chromium
export const devices = pw.devices
