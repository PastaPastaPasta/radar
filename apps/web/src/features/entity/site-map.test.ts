import { describe, expect, it } from 'vitest'
import { i18n } from '@lingui/core'
import { railEntries, SITE_GROUPS, SITE_MAP, findPage, type SiteSection } from './site-map'
import { PAGE_STORIES } from './site-map-stories'

const labels = (section: SiteSection) =>
  railEntries(section).map((e) => ({ to: e.href ?? e.to, title: i18n._(e.title) }))

describe('section rails', () => {
  it('lists the Network pages in order', () => {
    expect(labels('network').map((e) => e.to)).toEqual([
      '/nodes',
      '/masternodes',
      '/map',
      '/epochs',
      '/protocol',
      '/v24',
      '/changes',
    ])
    expect(labels('network').map((e) => e.title)).toContain('Core 24')
  })

  it('lists the Platform pages with one entry per group', () => {
    expect(labels('platform')).toEqual([
      { to: '/platform', title: 'Overview' },
      { to: '/platform/blocks', title: 'Blocks' },
      { to: '/platform/txs', title: 'Transitions' },
      { to: '/identities', title: 'Identities' },
      { to: '/contracts', title: 'Contracts' },
      { to: '/tokens', title: 'Tokens' },
      { to: '/names', title: 'Names' },
      { to: '/contests', title: 'Voting' },
      { to: '/quorums', title: 'Chain state' },
    ])
  })

  it('lists the Tools and You pages', () => {
    expect(labels('tools').map((e) => e.to)).toEqual([
      '/query',
      '/tools/transition',
      '/tools/contract',
      '/tools/verify-message',
      '/tools/qr',
      '/sdk-reference',
      '/api',
      '/sources',
    ])
    expect(labels('you').map((e) => e.to)).toEqual(['/saved', '/settings', '/about'])
  })

  it('keeps the validators alias out of the rail but in the palette', () => {
    expect(labels('network').some((e) => e.to === '/validators')).toBe(false)
    const validators = findPage('/validators')
    expect(validators?.nav).toBe(true)
    expect(validators?.keywords).toEqual(expect.arrayContaining(['validators', 'evonodes']))
  })

  it('keeps pages with params out of the palette', () => {
    expect(SITE_MAP.filter((p) => p.nav && p.path.includes('$'))).toEqual([])
  })
})

describe('page groups', () => {
  it('names only registered pages that carry the group', () => {
    for (const [group, { pages }] of Object.entries(SITE_GROUPS)) {
      for (const path of pages) expect(findPage(path)?.group, path).toBe(group)
    }
    const grouped = SITE_MAP.filter((p) => p.group).map((p) => p.path)
    expect(grouped.sort()).toEqual(
      Object.values(SITE_GROUPS)
        .flatMap((g) => g.pages)
        .sort(),
    )
  })
})

describe('page stories', () => {
  it('names the stories of every page, by route pattern', () => {
    expect(Object.keys(PAGE_STORIES).sort()).toEqual(SITE_MAP.map((p) => p.path).sort())
  })
})

describe('what a page says it reads', () => {
  it('names Platform Explorer on the transition tool, whose check sends the transition there', () => {
    expect(findPage('/tools/transition')?.sources).toEqual(['local', 'sdk', 'pe'])
  })

  it('names only the SDK on the names page, which reads nothing else', () => {
    expect(findPage('/names')?.sources).toEqual(['sdk'])
  })
})
