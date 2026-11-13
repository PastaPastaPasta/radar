import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'
import { networkQuery, withQuery } from '../routes'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const MAIN = {
  contract: 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR',
  history: 'DWvVDeMdhtJJz1VPQseJYfDJh9wKfxTmKhNEoc2hQiTs',
}
const TEST = {
  contract: 'FRsKDsmpZkzRuHN9d8nHrvhTeQjRou5h5A5Qw6RXbsrx',
  history: 'A32KF4c4fsTNdxLo3B3ZBr51gZYTpKQzEugBeFrkw6EW',
  issueContract: '4WjrqSyLscXtKsw3QUk6pKAXDaQBeahKvugLUZ4tbk86',
  issue: 'Zqke4VCuE3KdYVq6R79nExUmaDBfaStDj3uJgugZGeX',
  groups: '49PJEnNx7ReCitzkLdkDNr4s6RScGsnNexcdSZJ1ph5N',
  closed: '8vLiDsbJXzJUjHGmgrGMw1VQryLW8Tsc8Mn2PaXq6FBt',
}
const NAME = { mainnet: 'pshenmic', testnet: 'therealslimshaddy5' } as const

const go = async (page: Page, path: string, net: 'mainnet' | 'testnet', ...more: string[]) => {
  await page.goto(withQuery(path, networkQuery(net), ...more))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await settled(page)
}

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 500

const searchOf = (page: Page) => new URL(page.url()).searchParams

test.describe('contract page', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    const contract = net === 'mainnet' ? MAIN.contract : TEST.contract

    test(`${net}: a contract shows its owner, version, document types and a navigable schema @NX-20`, async ({
      page,
    }) => {
      await go(page, `/contract/${DPNS}`, net)
      const summary = page.locator('#contract')
      await expect(summary.getByText('Owner')).toBeVisible()
      await expect(summary.getByText('Version', { exact: true })).toBeVisible()
      await expect(
        page
          .locator('#types')
          .getByRole('link', { name: /Browse documents/ })
          .first(),
      ).toBeVisible()
      await expectAccessible(page)

      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: 'Schema' })
        .click()
      await expect(page).toHaveURL(/tab=schema/)
      await expect(
        page.locator('[data-schema-children]').getByRole('link', { name: /domain/ }),
      ).toBeVisible()
      await page
        .locator('[data-schema-children]')
        .getByRole('link', { name: /domain/ })
        .click()
      expect(searchOf(page).get('path')).toBe('/domain')
      await expect(page.locator('[data-schema-path]')).toContainText('domain')
      await expectAccessible(page)
    })

    test(`${net}: a schema path in the address opens that part of the schema @NX-20`, async ({
      page,
    }) => {
      await go(
        page,
        `/contract/${DPNS}`,
        net,
        'tab=schema',
        `path=${encodeURIComponent('/domain/properties/label')}`,
      )
      const crumbs = page.locator('[data-schema-path]')
      await expect(crumbs).toContainText('domain')
      await expect(crumbs).toContainText('properties')
      await expect(crumbs.locator('[aria-current="location"]')).toHaveText('label')
      await crumbs.getByRole('link', { name: 'properties' }).click()
      expect(searchOf(page).get('path')).toBe('/domain/properties')
      await expect(crumbs.locator('[aria-current="location"]')).toHaveText('properties')
      await expectAccessible(page)
    })

    test(`${net}: a path that is not in the schema says so @NX-20`, async ({ page }) => {
      await go(page, `/contract/${DPNS}`, net, 'tab=schema', `path=${encodeURIComponent('/nope')}`)
      await expect(page.getByText('That path isn’t in this schema.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open the whole schema' })).toBeVisible()
    })

    test(`${net}: a contract lists its tokens with their IDs @NX-24`, async ({ page }) => {
      await go(page, `/contract/${contract}`, net, 'tab=tokens')
      await expect(page.locator('#tokens')).toBeVisible()
      await expectAccessible(page)
    })

    test(`${net}: a contract's configuration is its own tab @NX-24`, async ({ page }) => {
      await go(page, `/contract/${contract}`, net, 'tab=config')
      await expect(page.getByText('Keeps version history')).toBeVisible()
      await expectAccessible(page)
    })
  }

  test('mainnet: a contract that keeps its history shows a version list and what each version changed @NX-24', async ({
    page,
  }) => {
    await go(page, `/contract/${MAIN.history}`, 'mainnet', 'tab=history')
    const versions = page.getByRole('table', { name: 'Versions of this contract' })
    await expect(versions.locator('tr[data-version]')).toHaveCount(2)
    await expect(page.getByText('Choose a version to see what it changed.')).toBeVisible()
    await versions
      .locator('tr[data-version="2"]')
      .getByRole('link', { name: 'See changes' })
      .click()
    expect(searchOf(page).get('rev')).toBe('2')
    const diff = page.locator('[data-diff]')
    await expect(diff).toContainText('Version 1 to version 2')
    await expect(diff.getByRole('list').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: the version diff is in the address, and the first version has nothing before it @NX-24', async ({
    page,
  }) => {
    await go(page, `/contract/${TEST.history}`, 'testnet', 'tab=history', 'rev=2')
    await expect(page.locator('[data-diff]')).toContainText('Version 1 to version 2')
    await page.goto(
      withQuery(`/contract/${TEST.history}`, networkQuery('testnet'), 'tab=history', 'rev=1'),
    )
    await settled(page)
    await expect(page.getByText(/is the first one recorded/)).toBeVisible()
    await expectAccessible(page)
  })

  test('a version that does not exist is said so @NX-24', async ({ page }) => {
    await go(page, `/contract/${MAIN.history}`, 'mainnet', 'tab=history', 'rev=9')
    await expect(page.getByText('This contract has no version 9.')).toBeVisible()
  })

  test('a contract that does not keep its history says so @NX-24', async ({ page }) => {
    await go(page, `/contract/${DPNS}`, 'mainnet', 'tab=history')
    await expect(page.getByText('This contract doesn’t keep its history.')).toBeVisible()
    await expectAccessible(page)
  })

  test('the types tab lists each document type with its indices @NX-21', async ({ page }) => {
    await go(page, `/contract/${DPNS}`, 'mainnet', 'tab=types')
    await expect(page.locator('#types')).toContainText('domain')
    await expect(page.locator('#types')).toContainText('normalizedParentDomainName')
    await expectAccessible(page)
  })
})

test.describe('documents browser', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    const name = NAME[net]
    const where = `normalizedParentDomainName~eq~dash,normalizedLabel~sw~${name}`

    test(`${net}: each document type opens a browser for it @NX-21`, async ({ page }) => {
      await go(page, `/contract/${DPNS}`, net)
      await page
        .locator('#types')
        .getByRole('link', { name: /Browse documents/ })
        .first()
        .click()
      await expect(page).toHaveURL(new RegExp(`/contract/${DPNS}/documents/`))
      await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
      await settled(page)
      await expect(
        page
          .getByRole('table', { name: /Documents of type/ })
          .locator('tbody tr')
          .first(),
      ).toBeVisible()
      await expectAccessible(page)
    })

    test(`${net}: a filter written in the address is read back, run and written the same @NX-22`, async ({
      page,
    }) => {
      await go(page, `/contract/${DPNS}/documents/domain`, net, `where=${where}`)
      const form = page.getByRole('form', { name: 'Filter documents' })
      await expect(form.locator('[data-clause]')).toHaveCount(2)
      await expect(form.getByRole('textbox', { name: 'Value' }).last()).toHaveValue(name)
      await expect(
        page
          .getByRole('table', { name: /Documents of type/ })
          .locator('tbody tr')
          .first(),
      ).toBeVisible()
      await expect(page.getByText(/DPNS stores o, i and l as 0, 1 and 1/)).toBeVisible()
      const before = searchOf(page).get('where')
      await form.getByRole('button', { name: 'Run query' }).click()
      await settled(page)
      expect(searchOf(page).get('where')).toBe(before)
      expect(before).toBe(where)
      await expectAccessible(page)
    })

    test(`${net}: a filter Platform would refuse is explained before anything is asked @NX-22`, async ({
      page,
    }) => {
      await go(page, `/contract/${DPNS}/documents/domain`, net, 'where=normalizedLabel~sw~abc')
      const problems = page.locator('[data-filter-problems]')
      await expect(problems).toBeVisible()
      await expect(problems.locator('[data-rule="skips-property"]')).toBeVisible()
      await expect(problems).toContainText('Won’t run')
      await expect(page.getByRole('button', { name: 'Run query' })).toBeDisabled()
      await expect(page.getByRole('table', { name: /Documents of type/ })).toHaveCount(0)
      await expectAccessible(page)
    })

    test(`${net}: next and previous page keep their place in the address @NX-22`, async ({
      page,
    }) => {
      await go(page, `/contract/${DPNS}/documents/domain`, net)
      const rows = page.getByRole('table', { name: /Documents of type/ }).locator('tbody tr')
      await expect(rows.first()).toBeVisible()
      const first = await rows.first().innerText()
      await page.getByRole('link', { name: 'Older' }).first().click()
      await settled(page)
      expect(searchOf(page).get('after')).toBeTruthy()
      await expect(rows.first()).toBeVisible()
      await expect.poll(async () => rows.first().innerText()).not.toBe(first)
      await page.getByRole('link', { name: 'Newer' }).first().click()
      await settled(page)
      expect(searchOf(page).get('after')).toBeNull()
      expect(await rows.first().innerText()).toBe(first)
      await expectAccessible(page)
    })
  }

  test('a type that the contract does not have says so @NX-21', async ({ page }) => {
    await go(page, `/contract/${DPNS}/documents/nosuchtype`, 'mainnet')
    await expect(page.getByText('This contract has no document type “nosuchtype”.')).toBeVisible()
  })

  test('the filter offers only what the type’s indices allow and drops a clause it can no longer run @NX-22', async ({
    page,
  }) => {
    await go(page, `/contract/${DPNS}/documents/domain`, 'mainnet')
    const form = page.getByRole('form', { name: 'Filter documents' })
    await form.getByRole('button', { name: 'Add a filter' }).click()
    const property = form.getByRole('combobox', { name: 'Property' }).first()
    await expect(property).toHaveValue('normalizedParentDomainName')
    await expect(
      form.getByRole('combobox', { name: 'Comparison' }).first().locator('option'),
    ).not.toHaveCount(0)
    await form.getByRole('button', { name: 'Remove filter' }).click()
    await expect(form.locator('[data-clause]')).toHaveCount(0)
    await expect(
      page.getByText('No filter: the first documents of this type are listed.'),
    ).toBeVisible()
  })
})

test.describe('document page', () => {
  test('mainnet: a document shows its data and its metadata @NX-23', async ({ page }) => {
    await go(
      page,
      `/document/${DPNS}/domain/FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS`,
      'mainnet',
    )
    await expect(page.locator('[data-layer="platform"]').first()).toBeVisible()
    await expect(page.getByText('Revision', { exact: true }).first()).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: a document whose type keeps history pages through its revisions @NX-23', async ({
    page,
  }) => {
    const path = `/document/${TEST.issueContract}/issue/${TEST.issue}`
    await go(page, path, 'testnet', 'tab=revisions')
    const items = page.locator('[data-revision]')
    await expect(items).toHaveCount(3)
    await expect(items.first()).toHaveAttribute('data-revision', '1')
    await expect(items.last()).toHaveAttribute('data-revision', '3')
    await expect(
      page.locator('[data-revision-pager]').getByRole('link', { name: 'Next' }),
    ).toHaveCount(0)
    await expectAccessible(page)

    await page.goto(withQuery(path, networkQuery('testnet'), 'tab=revisions', 'page=2'))
    await settled(page)
    await expect(page.getByText('No more revisions.')).toBeVisible()
    await page.getByRole('link', { name: 'Back to the previous page' }).click()
    await settled(page)
    await expect(page.locator('[data-revision]')).toHaveCount(3)
    expect(searchOf(page).get('page')).toBeNull()
  })

  test('mainnet: a type that does not keep history says so @NX-23', async ({ page }) => {
    await go(
      page,
      `/document/${DPNS}/domain/FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS`,
      'mainnet',
      'tab=revisions',
    )
    await expect(page.getByText('This document type doesn’t keep its history.')).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: the document names the transition that created or last changed it and its revisions @PE-18', async ({
    page,
  }) => {
    await go(
      page,
      `/document/${TEST.issueContract}/issue/${TEST.issue}`,
      'testnet',
      'tab=provenance',
    )
    const latest = page.locator('[data-provenance-latest]')
    await expect(latest).toContainText('Created or last changed by')
    await expect(latest.getByText('Transition', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('table', { name: 'Revisions recorded by Platform Explorer' }),
    ).toBeVisible()
    await expectAccessible(page)
  })
})

test.describe('contracts list', () => {
  for (const net of ['mainnet', 'testnet'] as const) {
    test(`${net}: featured contracts and a table of every contract with its filters @PE-16`, async ({
      page,
    }) => {
      await go(page, '/contracts', net)
      await expect(
        page
          .locator('[data-featured]')
          .getByRole('link', { name: /DPNS|Dash Platform Name Service/ })
          .first(),
      ).toBeVisible()
      const table = page.getByRole('table').first()
      await expect(table.locator('tbody tr').first()).toBeVisible()
      if (!onPhone(page)) {
        for (const header of ['Owner', 'Tokens', 'Documents']) {
          await expect(
            page.getByRole('columnheader', { name: new RegExp(header) }).first(),
          ).toBeVisible()
        }
      }
      await expectAccessible(page)
    })

    test(`${net}: a sort and a filter in the address are asked of Platform Explorer @PE-16`, async ({
      page,
    }) => {
      await go(page, '/contracts', net, 'sort=-docs', 'tokens=1')
      await expect(page.getByRole('table').first().locator('tbody tr').first()).toBeVisible()
      await expectAccessible(page)
    })
  }

  test('a contract ID typed in opens that contract and a wrong one is refused @PE-16', async ({
    page,
  }) => {
    await go(page, '/contracts', 'mainnet')
    const form = page.getByRole('form', { name: 'Open a contract' })
    await form.getByRole('textbox').fill('not an id')
    await form.getByRole('button').click()
    await expect(
      form
        .getByRole('alert')
        .or(page.getByText(/isn’t a contract ID|not a contract ID/i))
        .first(),
    ).toBeVisible()
    await form.getByRole('textbox').fill(DPNS)
    await form.getByRole('button').click()
    await expect(page).toHaveURL(new RegExp(`/contract/${DPNS}`))
  })
})

test.describe('contract activity', () => {
  test('mainnet: the transitions of a contract are listed @PE-17', async ({ page }) => {
    await go(page, `/contract/${DPNS}`, 'mainnet', 'tab=transactions')
    await expect(page.locator('#transactions')).toBeVisible()
    await expect(page.locator('#transactions').getByRole('table').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('mainnet: the documents of a contract are listed and can be filtered by type @PE-17', async ({
    page,
  }) => {
    await go(page, `/contract/${DPNS}`, 'mainnet', 'tab=documents')
    await expect(page.locator('#documents').getByRole('table').first()).toBeVisible()
    await expect(page.getByRole('combobox', { name: /type/i }).first()).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: a contract’s overview shows what Platform Explorer counted @PE-17', async ({
    page,
  }) => {
    await go(page, `/contract/${TEST.contract}`, 'testnet')
    await expect(page.locator('#activity')).toBeVisible()
  })
})

test.describe('groups', () => {
  test('testnet: a contract’s groups show position and threshold and open @NX-45', async ({
    page,
  }) => {
    await go(page, `/groups/${TEST.groups}`, 'testnet')
    const table = page.getByRole('table', { name: 'Groups' })
    await expect(table.locator('tbody tr').first()).toBeVisible()
    if (!onPhone(page)) {
      await expect(page.getByRole('columnheader', { name: /Position/ })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: /Required power/ })).toBeVisible()
    }
    await expectAccessible(page)
    await table.getByRole('link', { name: '0' }).click()
    await expect(page).toHaveURL(new RegExp(`/group/${TEST.groups}/0`))
    await expect(page.getByRole('heading', { level: 1, name: 'Group' })).toBeVisible()
  })

  test('testnet: a group lists its members by power @NX-45', async ({ page }) => {
    await go(page, `/group/${TEST.groups}/0`, 'testnet')
    const members = page.getByRole('table', { name: 'Members by power' })
    await expect(members.locator('tbody tr').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: an active action shows its signers on request @NX-45', async ({ page }) => {
    await go(page, `/group/${TEST.groups}/0`, 'testnet', 'tab=actions')
    const actions = page.getByRole('list', { name: 'Actions' })
    await expect(actions.getByRole('listitem').first()).toBeVisible()
    await actions.getByRole('button', { name: 'Show signers' }).first().click()
    await expect(actions.getByText(/signers?/).first()).toBeVisible()
    await expectAccessible(page)
  })

  test('testnet: closed actions are one tap from the active ones @NX-45', async ({ page }) => {
    await go(page, `/group/${TEST.closed}/0`, 'testnet', 'tab=actions')
    await page
      .getByRole('navigation', { name: 'Status' })
      .getByRole('link', { name: 'Closed' })
      .click()
    expect(searchOf(page).get('status')).toBe('closed')
    const actions = page.getByRole('list', { name: 'Actions' })
    await expect(actions.getByRole('listitem').first()).toBeVisible()
    await actions.getByRole('button', { name: 'Show signers' }).first().click()
    await expect(actions.getByText(/signers?/).first()).toBeVisible()
    await expectAccessible(page)
  })

  test('mainnet: a contract with no groups says so @NX-45', async ({ page }) => {
    await go(page, `/groups/${MAIN.contract}`, 'mainnet')
    await expect(page.getByText('This contract has no groups.')).toBeVisible()
    await expectAccessible(page)
  })

  test('a group position the contract does not have says so @NX-45', async ({ page }) => {
    await go(page, `/group/${TEST.groups}/9`, 'testnet')
    await expect(page.getByText('This contract has no group at position 9.')).toBeVisible()
  })

  test('the contract page lists its groups and links to each @NX-24 @NX-45', async ({ page }) => {
    await go(page, `/contract/${TEST.groups}`, 'testnet', 'tab=groups')
    await expect(page.locator('#groups')).toBeVisible()
    await expect(
      page
        .locator('#groups')
        .getByRole('link', { name: /0|Group/ })
        .first(),
    ).toBeVisible()
    await expectAccessible(page)
  })
})

test.describe('Decentralized only', () => {
  const mode = 'sources=decentralized'

  test('a contract page reads its data from Platform and says once that its activity needs a hosted source @PE-17 @NX-20', async ({
    page,
  }) => {
    await go(page, `/contract/${DPNS}`, 'mainnet', mode)
    await expect(page.locator('#types')).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expectAccessible(page)
    await page.goto(withQuery(`/contract/${DPNS}`, mode, 'tab=transactions'))
    await settled(page)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
  })

  test('the documents browser, a document and its revisions still work @NX-22 @NX-23', async ({
    page,
  }) => {
    await go(page, `/contract/${DPNS}/documents/domain`, 'mainnet', mode)
    await expect(
      page
        .getByRole('table', { name: /Documents of type/ })
        .locator('tbody tr')
        .first(),
    ).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
    await go(
      page,
      `/document/${TEST.issueContract}/issue/${TEST.issue}`,
      'testnet',
      mode,
      'tab=revisions',
    )
    await expect(page.locator('[data-revision]')).toHaveCount(3)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })

  test('a document’s provenance needs a hosted source and says so once @PE-18', async ({
    page,
  }) => {
    await go(
      page,
      `/document/${TEST.issueContract}/issue/${TEST.issue}`,
      'testnet',
      mode,
      'tab=provenance',
    )
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expectAccessible(page)
  })

  test('the contracts list keeps the featured contracts and the ID box and says once that the table needs a hosted source @PE-16', async ({
    page,
  }) => {
    await go(page, '/contracts', 'mainnet', mode)
    await expect(page.locator('[data-featured]')).toBeVisible()
    await expect(page.getByRole('form', { name: 'Open a contract' })).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expectAccessible(page)
  })

  test('groups and version history still work @NX-45 @NX-24', async ({ page }) => {
    await go(page, `/group/${TEST.groups}/0`, 'testnet', mode, 'tab=actions')
    await expect(
      page.getByRole('list', { name: 'Actions' }).getByRole('listitem').first(),
    ).toBeVisible()
    await go(page, `/contract/${MAIN.history}`, 'mainnet', mode, 'tab=history', 'rev=2')
    await expect(page.locator('[data-diff]')).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(0)
  })
})
