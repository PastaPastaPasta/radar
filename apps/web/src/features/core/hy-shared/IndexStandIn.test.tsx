import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { healthRegistry, resetHealthRegistry } from '@/data/health'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { StaleIndexNotice } from './HyphenGate'

const failHyphen = () => {
  for (let i = 0; i < 3; i++) {
    healthRegistry.report('mainnet', 'hyphen', { ok: false, kind: 'network', latencyMs: 5 })
  }
}

const mount = (reads?: 'insight') =>
  renderInRouter(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <StaleIndexNotice reads={reads} />
      </I18nProvider>
    </QueryClientProvider>,
  )

afterEach(() => {
  resetHealthRegistry()
})

describe('a page that reads Insight while Hyphen does not answer @W2-25 @X-09', () => {
  it('says Hyphen is not answering and that Insight stands in', async () => {
    await mount('insight')
    act(failHyphen)
    const note = await screen.findByText(/Hyphen isn’t answering, so this page reads Insight/)
    expect(note.closest('[data-index-stand-in]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'See the sources' })).toHaveAttribute(
      'href',
      expect.stringContaining('/status'),
    )
  })

  it('says nothing about Insight on a page that never reads it', async () => {
    await mount()
    act(failHyphen)
    expect(screen.queryByText(/reads Insight/)).toBeNull()
  })
})
