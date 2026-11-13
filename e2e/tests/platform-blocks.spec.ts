import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { horizontalOverflow, settled } from '../helpers/settled'
import { expect as baseExpect, test } from '../helpers/test'
import { netIds } from '../routes/fixtures'

const expect = baseExpect.configure({ timeout: 20_000 })

const main = netIds('mainnet')
const testnet = netIds('testnet')
const PBLOCK = main.id('pblock', '')
const PTX = main.id('ptx', '')
const T_PBLOCK = testnet.id('pblock', '')
const T_PTX = testnet.id('ptx', '')

/** Height of the mainnet review block, and of the testnet one. */
const HEIGHT = 468967
const T_HEIGHT = 667493
/** Its proposer, as Explorer names it. */
const PROPOSER = '2632413E35C56B1B0E5181B3D266550B5A4CCB6A7E4B7212BC2C7D2BE3D37450'
const OWNER = '5AqJsC1a1VwgpQBnXJaAwVfyAd7PN1miSQg1gEkMKhRt'
const FAILED = 'ab8b7cbb2c2c85d6e7140c54ce184abe8c5eabce24f9b8bbc65dad3f300a33db'
const WITH_DUPLICATES = '6963a9535dbd3d47229bbe419dfc2e3011dc786d958f72a4b7beee3f24fbe097'
const UNKNOWN = 'deadbeef'.repeat(8)

/** On a phone the filters sit behind a "Filters" button. */
async function openFilters(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /^Filters/ })
  if (await button.isVisible()) await button.click()
}

const rows = (page: Page, prefix: string) => page.locator(`table tbody a[href^="${prefix}"]`)

test.describe('Platform blocks list', () => {
  test('lists the newest blocks with their columns, each opening its block page @PE-10', async ({
    page,
  }) => {
    await page.goto('/platform/blocks')
    await expect(page.getByRole('heading', { level: 1, name: 'Platform blocks' })).toBeVisible()
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await settled(page)
    const headers = page.locator('table thead th')
    if ((page.viewportSize()?.width ?? 0) > 640) {
      for (const name of ['Block', 'Hash', 'Epoch', 'Proposer', 'Gas', 'Transitions', 'Time']) {
        await expect(headers.filter({ hasText: name }).first()).toBeVisible()
      }
    }
    await expect(page.locator('[data-source="pe"]').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectAccessible(page)
    await expect(rows(page, '/platform/block/').first()).toHaveAttribute(
      'href',
      /^\/platform\/block\/\d+$/,
    )
  })

  test('filters by epoch and gas from the address and shows what is on @PE-10', async ({
    page,
  }) => {
    await page.goto('/platform/blocks?network=testnet&epoch=20300..20335&gas=1..500000000')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await openFilters(page)
    await expect(page.getByLabel('Epoch minimum')).toHaveValue('20300')
    await expect(page.getByLabel('Epoch maximum')).toHaveValue('20335')
    await expect(page.getByLabel('Gas maximum')).toHaveValue('500000000')
    await expect(page.getByText('Epoch: 20300..20335')).toBeVisible()
    await expect(page.getByText('Gas: 1..500000000')).toBeVisible()
  })

  test('typing a height range puts it in the address and lists those blocks @PE-10', async ({
    page,
  }) => {
    await page.goto('/platform/blocks')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await openFilters(page)
    await page.getByLabel('Height minimum').fill('468000')
    await page.getByLabel('Height maximum').fill('469000')
    await page.getByLabel('Height maximum').press('Enter')
    await expect(page).toHaveURL(/height=468000\.\.469000/)
    await expect(page.getByText('Height: 468000..469000')).toBeVisible()
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
  })

  test('filters by proposer and by a date range @PE-10', async ({ page }) => {
    await page.goto(`/platform/blocks?proposer=${PROPOSER.toLowerCase()}`)
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await openFilters(page)
    await expect(page.getByRole('textbox', { name: 'Proposer' })).toHaveValue(PROPOSER.toLowerCase())
    await page.goto('/platform/blocks?from=2026-11-10&to=2026-11-11')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await openFilters(page)
    await expect(page.getByLabel('Date from')).toHaveValue('2026-11-10')
    await expect(page.getByLabel('Date to')).toHaveValue('2026-11-11')
  })

  test('refuses a proposer that is not a ProTxHash @PE-10', async ({ page }) => {
    await page.goto('/platform/blocks')
    await openFilters(page)
    const box = page.getByRole('textbox', { name: 'Proposer' })
    await box.fill('nope')
    await box.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: '64 hexadecimal' })).toBeVisible()
    await expect(page).not.toHaveURL(/proposer=/)
  })

  test('pages through the list with the address holding the page @PE-10', async ({ page }) => {
    await page.goto('/platform/blocks')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await page.getByRole('link', { name: /^Next/ }).first().click()
    await expect(page).toHaveURL(/page=2/)
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
  })

  test('works on testnet @PE-10', async ({ page }) => {
    await page.goto('/platform/blocks?network=testnet')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await expect(page.locator('dashhq-bar')).toHaveAttribute('network', 'testnet')
  })
})

test.describe('Platform block', () => {
  test('shows the digest, the Core block it is locked to and the tabs @PE-11', async ({ page }) => {
    await page.goto(`/platform/block/${PBLOCK}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Platform block' })).toBeVisible()
    await expect(page.getByText(`Block ${HEIGHT.toLocaleString('en-US')}`)).toBeVisible()
    await expect(page.getByText(PROPOSER.slice(0, 6)).first()).toBeVisible()
    const core = page.locator('a[href^="/block/2570010"]').first()
    await expect(core).toBeVisible()
    await expect(page.locator('a[rel="prev"]')).toHaveAttribute(
      'href',
      new RegExp(`/platform/block/${HEIGHT - 1}`),
    )
    await expect(page.locator('a[rel="next"]')).toHaveAttribute(
      'href',
      new RegExp(`/platform/block/${HEIGHT + 1}`),
    )
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /Transitions/ })).toBeVisible()
    await expectAccessible(page)
  })

  test('opens by its height as well as by its hash @PE-11', async ({ page }) => {
    await page.goto(`/platform/block/${HEIGHT}`)
    await expect(page.getByText(`Block ${HEIGHT.toLocaleString('en-US')}`)).toBeVisible()
    await expect(page.getByText('4F714D46', { exact: false }).first()).toBeVisible()
  })

  test('lists the transitions a block holds, and its quorum and details @PE-11', async ({
    page,
  }) => {
    await page.goto(`/platform/block/${T_PBLOCK}?network=testnet`)
    await expect(page.getByText(`Block ${T_HEIGHT.toLocaleString('en-US')}`)).toBeVisible()
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Quorum' }).click()
    await expect(page).toHaveURL(/tab=quorum/)
    await expect(page.getByText('Quorum hash').first()).toBeVisible()
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Details' }).click()
    await expect(page).toHaveURL(/tab=info/)
    await expect(page.locator('[data-json-view], .rx-json').first()).toBeVisible()
  })

  test('says so when the block holds no transitions @PE-11', async ({ page }) => {
    await page.goto(`/platform/block/${PBLOCK}`)
    await expect(page.getByText('This block holds no state transitions')).toBeVisible()
  })

  test('says so for a height Platform Explorer does not have, and for text that is no block @PE-11', async ({
    page,
  }) => {
    await page.goto('/platform/block/999999999')
    await expect(page.getByText(/Platform Explorer has no block/)).toBeVisible()
    await page.goto('/platform/block/nonsense')
    await expect(page.getByText("That isn't a block height or hash.")).toBeVisible()
  })
})

test.describe('State transitions list', () => {
  test('lists the newest state transitions with their columns @PE-12', async ({ page }) => {
    await page.goto('/platform/txs')
    await expect(page.getByRole('heading', { level: 1, name: 'State transitions' })).toBeVisible()
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await settled(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expectAccessible(page)
  })

  test('filters by type, batch type, status, gas, owner and date from the address @PE-12', async ({
    page,
  }) => {
    await page.goto('/platform/txs?type=batch&status=fail')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Failed', pressed: true })).toBeVisible()
    await page.goto('/platform/txs?batch=document-create')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.goto('/platform/txs?gas=1000..100000000')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.goto(`/platform/txs?owner=${OWNER}`)
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.goto('/platform/txs?from=2026-11-10&to=2026-11-11')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
  })

  test('choosing a status writes it to the address @PE-12', async ({ page }) => {
    await page.goto('/platform/txs')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await openFilters(page)
    await page.getByRole('button', { name: 'Failed' }).click()
    await expect(page).toHaveURL(/status=fail/)
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
  })

  test('chooses several types and a batch type from the lists @PE-12', async ({ page }) => {
    await page.goto('/platform/txs')
    await openFilters(page)
    await page.locator('details', { hasText: /^Type/ }).first().locator('summary').click()
    await page.getByRole('checkbox', { name: 'Identity top-up', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Identity create', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Identity top-up', exact: true })).toBeChecked()
    await expect(page).toHaveURL(/type=/)
    await expect(page).toHaveURL(/identity-top-up/)
    await expect(page).toHaveURL(/identity-create/)
  })

  test('sorts by gas @PE-12', async ({ page }) => {
    await page.goto('/platform/txs?sort=-gas')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
  })

  test('works on testnet @PE-12', async ({ page }) => {
    await page.goto('/platform/txs?network=testnet')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
  })
})

test.describe('Scroll or pages', () => {
  test('appends the next page in scroll mode and remembers the choice across a reload @PE-38', async ({
    page,
  }) => {
    await page.goto('/platform/txs')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.getByRole('button', { name: 'Scroll' }).click()
    await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible()
    const before = await rows(page, '/platform/tx/').count()
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(() => rows(page, '/platform/tx/').count()).toBeGreaterThan(before)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Scroll', pressed: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible()
    await page.getByRole('button', { name: 'Pages' }).click()
    await expect(page.getByRole('button', { name: 'Pages', pressed: true })).toBeVisible()
  })

  test('changes the page size and remembers it @PE-38', async ({ page }) => {
    await page.goto('/platform/txs')
    await expect(rows(page, '/platform/tx/').first()).toBeVisible()
    await page.getByLabel('Rows per page').selectOption('10')
    await expect.poll(() => rows(page, '/platform/tx/').count()).toBe(10)
    await page.reload()
    await expect(page.getByLabel('Rows per page')).toHaveValue('10')
    await page.getByLabel('Rows per page').selectOption('25')
  })

  test('keeps the same choice on the blocks list @PE-38', async ({ page }) => {
    await page.goto('/platform/blocks')
    await expect(rows(page, '/platform/block/').first()).toBeVisible()
    await page.getByRole('button', { name: 'Scroll' }).click()
    await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible()
    await page.getByRole('button', { name: 'Pages' }).click()
  })
})

test.describe('State transition', () => {
  test('shows time, hash, block, type, status, owner, gas and fee multiplier @PE-13', async ({
    page,
  }) => {
    await page.goto(`/platform/tx/${PTX}`)
    await expect(page.getByRole('heading', { level: 1, name: 'State transition' })).toBeVisible()
    const card = page.locator('[data-details]')
    await expect(card).toBeVisible()
    await expect(page.getByText('Fee multiplier')).toBeVisible()
    await expect(page.getByText('×1.00')).toBeVisible()
    await expect(page.locator(`a[href^="/platform/block/468960"]`).first()).toBeVisible()
    await expect(page.locator(`a[href^="/identity/${OWNER}"]`).first()).toBeVisible()
    await expect(page.getByText('Signature', { exact: true })).toBeVisible()
    await expect(page.getByText('Gas used')).toBeVisible()
    await expectAccessible(page)
  })

  test('shows the raw transition as JSON, hex and base64, kept in the address @PE-13', async ({
    page,
  }) => {
    await page.goto(`/platform/tx/${PTX}`)
    await expect(page.locator('[data-details]')).toBeVisible()
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Hex' }).click()
    await expect(page).toHaveURL(/raw=hex/)
    await expect(page.locator('[data-raw="hex"]')).toContainText('0201')
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Base64' }).click()
    await expect(page).toHaveURL(/raw=base64/)
    await expect(page.locator('[data-raw="base64"]')).toContainText('AgE985jXzw2c')
    await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'JSON' }).click()
    await expect(page).not.toHaveURL(/raw=/)
    await page.goto(`/platform/tx/${PTX}?raw=hex`)
    await expect(page.locator('[data-raw="hex"]')).toBeVisible()
  })

  test('lists the later blocks that sent the same transition again @PE-13', async ({ page }) => {
    await page.goto(`/platform/tx/${WITH_DUPLICATES}`)
    await expect(page.locator('[data-duplicates]')).toBeVisible()
    await expect(page.locator('[data-duplicates] a[href^="/platform/tx/"]').first()).toBeVisible()
    await expect(page.getByText('Failed').first()).toBeVisible()
  })

  test('has a panel for each transition type @PE-13', async ({ page }) => {
    test.setTimeout(240_000)
    for (const [name, hash, label] of TYPES) {
      await test.step(name, async () => {
        await page.goto(`/platform/tx/${hash}`)
        const card = page.locator('[data-details]')
        await expect(card, name).toBeVisible()
        await expect(card.getByText(label).first(), name).toBeVisible()
        await expect(page.locator('[data-decode-failed]'), name).toHaveCount(0)
        await settled(page)
      })
    }
  })

  test('works on testnet @PE-13', async ({ page }) => {
    await page.goto(`/platform/tx/${T_PTX}?network=testnet`)
    await expect(page.locator('[data-details]')).toBeVisible()
    await expect(page.getByText('Executed')).toBeVisible()
  })
})

test.describe('Result of a state transition from a node', () => {
  test('shows that a transition executed @NX-60', async ({ page }) => {
    await page.goto(`/platform/tx/${PTX}`)
    const card = page.locator('[data-live-result]')
    await expect(card.getByText('Executed')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Check again' })).toBeVisible()
  })

  test('shows the error of a transition that failed @NX-60', async ({ page }) => {
    await page.goto(`/platform/tx/${FAILED}`)
    const card = page.locator('[data-live-result]')
    await expect(card.getByText('Failed')).toBeVisible()
    await expect(card.getByText(/invalid revision/)).toBeVisible()
    await expect(page.getByText('Fee multiplier')).toBeVisible()
  })

  test('says "not yet executed" for a hash nothing knows, and lets you ask again @NX-60', async ({
    page,
  }) => {
    await page.goto(`/platform/tx/${UNKNOWN}`)
    await expect(page.locator('[data-not-indexed]')).toBeVisible()
    const card = page.locator('[data-live-result]')
    await expect(card.getByText('No result yet')).toBeVisible()
    await expect(card.locator('[data-live-note="pending"]')).toContainText('not executed yet')
    await card.getByRole('button', { name: 'Check again' }).click()
    await expect(card.getByText('No result yet')).toBeVisible()
    await expectAccessible(page)
  })

  test('refuses text that is no hash @NX-60', async ({ page }) => {
    await page.goto('/platform/tx/not-a-hash')
    await expect(page.getByText("That isn't a state transition hash.")).toBeVisible()
  })
})

test.describe('Decentralized only mode', () => {
  test('lists say Platform keeps no list, and offer a hash and a height lookup @PE-10 @PE-12', async ({
    page,
  }) => {
    for (const path of ['/platform/blocks', '/platform/txs']) {
      await page.goto(`${path}?sources=decentralized`)
      await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
      await expect(page.locator('table')).toHaveCount(0)
      await expect(page.locator('[data-index-needed]')).toBeVisible()
    }
    await page.getByLabel('Open a state transition by its hash').fill(PTX)
    await page.getByRole('button', { name: 'Open' }).click()
    await expect(page).toHaveURL(new RegExp(`/platform/tx/${PTX.toLowerCase()}`))
    await expect(page.locator('[data-live-result]')).toBeVisible()
  })

  test('the height box says block pages need the index @PE-11', async ({ page }) => {
    await page.goto('/platform/txs?sources=decentralized')
    await page.getByLabel('Look up a block by its height').fill('468967')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.locator('[data-height-note]')).toBeVisible()
  })

  test('a block page says it needs the index @PE-11', async ({ page }) => {
    await page.goto(`/platform/block/${PBLOCK}?sources=decentralized`)
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(page.locator('[data-details]')).toHaveCount(0)
  })

  test('a transition page keeps the node result and says the indexed details need the index @NX-60 @PE-13', async ({
    page,
  }) => {
    await page.goto(`/platform/tx/${PTX}?sources=decentralized`)
    await expect(page.locator('[data-live-result]').getByText('Executed')).toBeVisible()
    await expect(page.locator('[data-unavailable="mode"]')).toHaveCount(1)
    await expect(page.locator('[data-details]')).toHaveCount(0)
  })
})

/** Each transition type with a mainnet example, and a label its panel shows. */
const TYPES: readonly (readonly [string, string, string])[] = [
  [
    'DATA_CONTRACT_CREATE',
    '4ee59198d60c50a0277ef813247bc1d7f902e72ad1ca0f7df65e8ef9c658ceeb',
    'Document types',
  ],
  [
    'IDENTITY_CREATE',
    '0b343062c58129f72aa5d3851d6c9c155b14ccf66ea344e298b60bba53930dac',
    'Funded by',
  ],
  [
    'IDENTITY_TOP_UP',
    '6eacbe35350981cc464752f5cb647f39cc228783b93c63cd79063d74b44eaabb',
    'Funded by',
  ],
  [
    'DATA_CONTRACT_UPDATE',
    '341847fce19e11e517c2c41f2fd780ba6964140e8117997c5506406f48269e06',
    'Document types',
  ],
  [
    'IDENTITY_UPDATE',
    '126c1dd09dda5eaa11b478c00232efc55d14123d15fc4a082202db000faeecbf',
    'Keys added',
  ],
  [
    'IDENTITY_CREDIT_WITHDRAWAL',
    '27845bc7054a7aa6f107c57035444278da06df14077d1bf5f47005ce56b378c7',
    'Core fee per byte',
  ],
  [
    'IDENTITY_CREDIT_TRANSFER',
    '0ff5654c37374bd9c89abb40087ea399b3e6658aa973e4d96b6488ade421b60f',
    'Recipient',
  ],
  [
    'MASTERNODE_VOTE',
    '1f6b877adcfda7f221eab0c3d3d06a4f0a7472cfc6af9e59088b4796aef607ba',
    'Voter identity',
  ],
  [
    'IDENTITY_CREDIT_TRANSFER_TO_ADDRESS',
    '2cda30b593403429839b9c76fba1745f5d8477ed3b3a99c864680e2654b6de94',
    'Outputs',
  ],
  [
    'IDENTITY_CREATE_FROM_ADDRESSES',
    '4cd2a615fa24c0081f29bcb371ff927d29ec503579b2c52113cc25779fdc7f56',
    'Inputs',
  ],
  [
    'IDENTITY_TOP_UP_FROM_ADDRESSES',
    'c0119a6f58866d61fb96e70eb02aaadc9457081a6587f530acf3c924bb2cf185',
    'Inputs',
  ],
  [
    'ADDRESS_FUNDS_TRANSFER',
    '7d2a009499fdf09c1849a552e46be79b30026ab48741a2561fc8436bf78942e1',
    'Outputs',
  ],
  [
    'ADDRESS_FUNDING_FROM_ASSET_LOCK',
    '05485be7fc91df705654392db3c3e30287341a8588ae1e7844bb0eaf90b3f453',
    'Funded by',
  ],
  [
    'ADDRESS_CREDIT_WITHDRAWAL',
    '6132d9a0686a8e4d4806776bf17d22a137b639be436b3ae552687fe570325db9',
    'Pays out to',
  ],
  [
    'SHIELD',
    '2a4d8b45478f9fd3b97b99225c11e347720897cb486fd5fa34efa3f414c3ae27',
    'Shielded actions',
  ],
  [
    'SHIELDED_TRANSFER',
    '00fb0f6aaf0b3606f196f51febae7c83869bee1f117368fd017b8ddaca6ac416',
    'Shielded actions',
  ],
  [
    'UNSHIELD',
    'dfd847144721ac8d2b5f7abb4e77e234cf3c4a2e8140a7782d8ea2455401d840',
    'Shielded actions',
  ],
  [
    'SHIELD_FROM_ASSET_LOCK',
    '5598f6315df208a47415a1cb44eb0ecd732c5efa657e677414c291e492157d6f',
    'Shielded actions',
  ],
  [
    'SHIELDED_WITHDRAWAL',
    '9a78885b541d83fa54c084ba3c859eb1b35c3f883464f3b608428f0a872874e4',
    'Shielded actions',
  ],
  [
    'IDENTITY_CREATE_FROM_SHIELDED_POOL',
    '27802f938c8ada140078f8e370f65685ad8f96f854300d79709366aa573e521c',
    'Shielded actions',
  ],
  [
    'DOCUMENT_CREATE',
    '37da9bf42f8492587aa49ae324b3eb9abcee375795a405d07bf6153279876980',
    'Action 1',
  ],
  [
    'DOCUMENT_REPLACE',
    '1c5dd8c2b21c83005fababf11278977a5fb23cd2203dcace52d81903337785bd',
    'Action 1',
  ],
  [
    'DOCUMENT_DELETE',
    '495bd0b22f15c4d674dbe6da9e912e91228941f327e0aaba13427c5cb721a930',
    'Action 1',
  ],
  [
    'DOCUMENT_TRANSFER',
    '20cbaec5f81cbdfd2c82f49cc908d994878bd1506d5422e331df39ad1b762e37',
    'Action 1',
  ],
  [
    'DOCUMENT_UPDATE_PRICE',
    '2609289ee2c9ba319e2f69ab960baec35da17619b6cec8c36e7f348dcc8bd563',
    'Action 1',
  ],
  [
    'DOCUMENT_PURCHASE',
    '264167b2e01f516750b0cb5df26be72686581be30816e5068aad17db87c3dd34',
    'Action 1',
  ],
  ['TOKEN_MINT', '71be6d6681760930021e06a14da924ae78ffea315303fc38985794824253a1e2', 'Action 1'],
  [
    'TOKEN_TRANSFER',
    'ec791b87737c7ccab27551150f42f776e206de55d14fabd6bc9bbf1700e4f0a8',
    'Action 1',
  ],
]
