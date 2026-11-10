import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

export const test = base.extend({
  context: async ({ context, baseURL, colorScheme }, use) => {
    if (baseURL) {
      await context.addCookies([
        { name: 'dh_theme', value: colorScheme === 'dark' ? 'dark' : 'light', url: baseURL },
      ])
    }
    await use(context)
  },
})
