import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { SourceId } from '@/data/envelope'
import type { Layer } from '@/ui'

export type SiteGroup = 'voting' | 'chain'

export type SiteSection = 'home' | 'search' | 'core' | 'network' | 'platform' | 'tools' | 'you'

export interface SitePage {
  /** Route id pattern, e.g. `/block/$id`. */
  path: string
  title: MessageDescriptor
  section: SiteSection
  layer: Layer
  /** What the finished page shows, in a sentence or two. */
  summary: MessageDescriptor
  sources: SourceId[]
  /** Listed in the section's page navigation and the palette. Only for routes without params. */
  nav?: boolean
  /** The page is one of a group that shares one rail entry and a row of tabs (`SITE_GROUPS`). */
  group?: SiteGroup
  /** A concrete URL for a rail entry whose route has params. The entry is in the rail but not in the palette. */
  navHref?: string
  /** The rail's short label when it differs from the page's title. */
  railTitle?: MessageDescriptor
  /** False for an alias that redirects to another rail page. */
  rail?: boolean
  keywords?: string[]
  /** The thing a record page shows, for titles and the other-network notice: "block", "masternode". */
  record?: MessageDescriptor
}

export const SOURCE_LABELS: Record<SourceId, MessageDescriptor> = {
  sdk: msg`the Platform SDK, proof-checked`,
  dapi: msg`DAPI`,
  radar: msg`Radar’s crawl`,
  pe: msg`Platform Explorer`,
  hyphen: msg`Hyphen`,
  insight: msg`Insight`,
  rate: msg`the Platform Explorer price feed`,
  local: msg`your browser`,
}

export const SECTION_LABELS: Record<SiteSection, MessageDescriptor> = {
  home: msg`Home`,
  search: msg`Search`,
  core: msg`Core`,
  network: msg`Network`,
  platform: msg`Platform`,
  tools: msg`Tools`,
  you: msg`You`,
}

/** The page's name in the active language. */
export const pageTitle = (p: SitePage): string => i18n._(p.title)
export const pageSummary = (p: SitePage): string => i18n._(p.summary)
export const sectionLabel = (section: SiteSection): string => i18n._(SECTION_LABELS[section])
export const recordLabel = (p: SitePage): string | undefined => p.record && i18n._(p.record)
export const sourceLabel = (source: SourceId): string => i18n._(SOURCE_LABELS[source])

const page = (p: SitePage): SitePage => p

export const SITE_MAP: SitePage[] = [
  page({
    path: '/',
    title: msg`Network pulse`,
    section: 'home',
    layer: 'neutral',
    summary: msg`Core tip and ChainLock, Platform height and epoch, the node map and census headline, the latest blocks and transitions, and upgrade status.`,
    sources: ['dapi', 'sdk', 'radar', 'pe'],
  }),
  page({
    path: '/search',
    title: msg`Search`,
    section: 'search',
    layer: 'neutral',
    summary: msg`Full results for any height, hash, address, ProTx, IP, identity, contract, token, name or epoch, grouped by what each one is.`,
    sources: ['local', 'dapi', 'sdk', 'pe', 'hyphen'],
    keywords: ['find', 'lookup'],
  }),

  page({
    path: '/blocks',
    title: msg`Blocks`,
    section: 'core',
    layer: 'core',
    summary: msg`Recent Core blocks with height, size, transactions, miner and ChainLock state, and a date picker that lists a day’s blocks.`,
    sources: ['dapi', 'hyphen'],
    nav: true,
    keywords: ['chain', 'height', 'date'],
  }),
  page({
    path: '/block/$id',
    title: msg`Block`,
    section: 'core',
    layer: 'core',
    summary: msg`One Core block by height or hash: header, coinbase payload, reward split, ChainLock and its transactions.`,
    sources: ['dapi', 'hyphen'],
    record: msg`block`,
  }),
  page({
    path: '/tx/$txid',
    title: msg`Transaction`,
    section: 'core',
    layer: 'core',
    summary: msg`One Core transaction: inputs, outputs, special payload, InstantSend and ChainLock state, and the Platform identity it funded.`,
    sources: ['dapi', 'hyphen'],
    record: msg`transaction`,
  }),
  page({
    path: '/address/$address',
    title: msg`Address`,
    section: 'core',
    layer: 'core',
    summary: msg`A Core address’s balance, history and unspent outputs, with new-activity notices.`,
    sources: ['hyphen'],
    record: msg`address`,
  }),
  page({
    path: '/mempool',
    title: msg`Mempool`,
    section: 'core',
    layer: 'core',
    summary: msg`Unconfirmed transactions as they arrive, with size, fee rate and InstantSend locks.`,
    sources: ['hyphen', 'dapi'],
    nav: true,
    keywords: ['unconfirmed', 'pending'],
  }),
  page({
    path: '/rich-list',
    title: msg`Rich list`,
    section: 'core',
    layer: 'core',
    summary: msg`The largest Core balances, with share of supply and the labels Radar knows.`,
    sources: ['hyphen'],
    nav: true,
    keywords: ['richest', 'balances', 'holders'],
  }),
  page({
    path: '/charts',
    title: msg`Charts`,
    section: 'core',
    layer: 'core',
    summary: msg`Core network metrics over time: transactions, fees, difficulty, supply and mining.`,
    sources: ['hyphen'],
    nav: true,
    keywords: ['metrics', 'supply', 'difficulty'],
  }),
  page({
    path: '/governance',
    title: msg`Governance`,
    section: 'core',
    layer: 'core',
    summary: msg`Budget proposals with vote counts, status and the next superblock.`,
    sources: ['hyphen'],
    nav: true,
    keywords: ['proposals', 'budget', 'superblock'],
  }),
  page({
    path: '/governance/$hash',
    title: msg`Proposal`,
    section: 'core',
    layer: 'core',
    summary: msg`One governance proposal: payment, timeline, vote history and a link to vote.`,
    sources: ['hyphen'],
    record: msg`proposal`,
  }),
  page({
    path: '/internals',
    title: msg`Network internals`,
    section: 'core',
    layer: 'core',
    summary: msg`Chain size, mempool pressure, transaction velocity, node versions, masternode counts and the peers Hyphen reads from.`,
    sources: ['hyphen'],
    nav: true,
    keywords: ['network', 'peers', 'utxo', 'versions'],
  }),
  page({
    path: '/status',
    title: msg`Status`,
    section: 'core',
    layer: 'core',
    summary: msg`Every data source Radar reads, its health and freshness on this network, and the DAPI request budget.`,
    sources: ['radar', 'pe', 'hyphen', 'dapi', 'sdk'],
    nav: true,
    keywords: ['health', 'sources', 'budget'],
  }),

  page({
    path: '/nodes',
    title: msg`Nodes`,
    section: 'network',
    layer: 'network',
    summary: msg`The census: how many nodes answered the last crawl, versions, hosting, countries and reachability.`,
    sources: ['radar'],
    nav: true,
    keywords: ['census', 'versions', 'hosting', 'countries'],
  }),
  page({
    path: '/masternodes',
    title: msg`Masternodes`,
    section: 'network',
    layer: 'network',
    summary: msg`Every masternode and evonode with status, version, location, uptime and payments. Filters, sorting and paging live in the link.`,
    sources: ['radar', 'dapi'],
    nav: true,
    keywords: ['evonodes', 'protx', 'operators'],
  }),
  page({
    path: '/mn/$protx',
    title: msg`Masternode`,
    section: 'network',
    layer: 'network',
    summary: msg`One masternode: overview, network reachability, Platform record, history and payments.`,
    sources: ['radar', 'dapi', 'sdk', 'pe'],
    record: msg`masternode`,
  }),
  page({
    path: '/map',
    title: msg`Map`,
    section: 'network',
    layer: 'network',
    summary: msg`Masternodes and other nodes on a world map, coloured by reachability, version or type.`,
    sources: ['radar'],
    nav: true,
    keywords: ['world', 'geography'],
  }),
  page({
    path: '/epochs',
    title: msg`Epochs`,
    section: 'network',
    layer: 'network',
    summary: msg`The current Platform epoch, who proposes next and what evonodes earned in past epochs.`,
    sources: ['sdk', 'radar'],
    nav: true,
    keywords: ['rewards', 'proposers'],
  }),
  page({
    path: '/epoch/$n',
    title: msg`Epoch`,
    section: 'network',
    layer: 'network',
    summary: msg`One finalized Platform epoch: totals, proposers and the neighbouring epochs.`,
    sources: ['sdk'],
    record: msg`epoch`,
  }),
  page({
    path: '/protocol',
    title: msg`Protocol`,
    section: 'network',
    layer: 'network',
    summary: msg`Platform protocol version voting: the current and next version and each evonode’s vote.`,
    sources: ['sdk', 'radar'],
    nav: true,
    keywords: ['upgrade', 'version', 'vote'],
  }),
  page({
    path: '/v24',
    title: msg`Core 24 activation`,
    section: 'network',
    layer: 'network',
    summary: msg`Where the Core 24 activation stands: threshold, miner signalling window by window and masternode readiness.`,
    sources: ['radar'],
    nav: true,
    keywords: ['activation', 'v24', 'signalling'],
    railTitle: msg`Core 24`,
  }),
  page({
    path: '/changes',
    title: msg`Changes`,
    section: 'network',
    layer: 'network',
    summary: msg`Registrations, updates, bans and removals across the masternode list, newest first.`,
    sources: ['radar'],
    nav: true,
    keywords: ['registrations', 'bans', 'removed'],
  }),
  page({
    path: '/validators',
    title: msg`Validators`,
    section: 'network',
    layer: 'network',
    summary: msg`The Platform validator set: evonodes with their Platform record, shown on the masternode list.`,
    sources: ['radar', 'pe'],
    nav: true,
    keywords: ['validators', 'evonodes', 'platform'],
    rail: false,
  }),

  page({
    path: '/platform',
    title: msg`Platform`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Platform’s pulse: height, epoch, activity charts, leaders and the newest blocks and state transitions.`,
    sources: ['sdk', 'pe'],
    nav: true,
    keywords: ['pulse', 'height', 'leaders'],
    railTitle: msg`Overview`,
  }),
  page({
    path: '/platform/blocks',
    title: msg`Platform blocks`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Every Platform block with epoch, proposer, transactions and time, filterable.`,
    sources: ['pe'],
    nav: true,
    railTitle: msg`Blocks`,
  }),
  page({
    path: '/platform/block/$id',
    title: msg`Platform block`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One Platform block: digest, the Core block it is locked to, its transitions and quorum.`,
    sources: ['pe', 'sdk'],
    record: msg`Platform block`,
  }),
  page({
    path: '/platform/txs',
    title: msg`State transitions`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Every state transition with type, status, block, gas and owner, filterable.`,
    sources: ['pe'],
    nav: true,
    keywords: ['transitions', 'transactions'],
    railTitle: msg`Transitions`,
  }),
  page({
    path: '/platform/tx/$hash',
    title: msg`State transition`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One state transition: status, fees, signature, raw bytes and a panel for its type.`,
    sources: ['pe', 'sdk'],
    record: msg`state transition`,
  }),
  page({
    path: '/identities',
    title: msg`Identities`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Identities with balance, transactions and creation time; sort by balance or activity.`,
    sources: ['pe', 'sdk'],
    nav: true,
  }),
  page({
    path: '/identity/lookup',
    title: msg`Identity by key hash`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Find the identity that holds a public key, from its 40-character key hash.`,
    sources: ['sdk'],
    keywords: ['pkh', 'public key hash'],
  }),
  page({
    path: '/identity/$id',
    title: msg`Identity`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One identity: balance, keys, names, tokens, contracts, documents and funding transaction, each proof-checked.`,
    sources: ['sdk', 'pe'],
    record: msg`identity`,
  }),
  page({
    path: '/contracts',
    title: msg`Contracts`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Featured and indexed data contracts with owner, documents and tokens.`,
    sources: ['pe', 'sdk'],
    nav: true,
    keywords: ['data contracts'],
  }),
  page({
    path: '/contract/$id',
    title: msg`Contract`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One data contract: owner, version, document types, schema, tokens and groups.`,
    sources: ['sdk', 'pe'],
    record: msg`contract`,
  }),
  page({
    path: '/contract/$id/documents/$type',
    title: msg`Documents`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Browse a contract’s documents of one type, filtered by its indices.`,
    sources: ['sdk'],
    record: msg`document type`,
  }),
  page({
    path: '/document/$contract/$type/$id',
    title: msg`Document`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One document with its data, metadata, revision history and the transition that wrote it.`,
    sources: ['sdk', 'pe'],
    record: msg`document`,
  }),
  page({
    path: '/tokens',
    title: msg`Tokens`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Tokens with supply, price and contract, and the trending ones.`,
    sources: ['pe', 'sdk'],
    nav: true,
  }),
  page({
    path: '/token/$id',
    title: msg`Token`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One token: supply, price, pause state, definition, activity and a balance lookup.`,
    sources: ['sdk', 'pe'],
    record: msg`token`,
  }),
  page({
    path: '/token/$id/holders',
    title: msg`Token holders`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Balances for the identities you choose, and the holders Platform Explorer has indexed.`,
    sources: ['sdk', 'pe'],
    record: msg`token`,
  }),
  page({
    path: '/names',
    title: msg`Names`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Search DPNS names by prefix, or browse all of them alphabetically.`,
    sources: ['sdk'],
    nav: true,
    keywords: ['dpns', 'usernames', 'domains'],
  }),
  page({
    path: '/name/$label',
    title: msg`Name`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One DPNS name: whether it is available, registered or contested, and who owns it.`,
    sources: ['sdk'],
    record: msg`name`,
  }),
  page({
    path: '/contests',
    title: msg`Name contests`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Active contested names with end time, votes and status.`,
    sources: ['sdk', 'pe'],
    nav: true,
    keywords: ['vote', 'dpns'],
    group: 'voting',
  }),
  page({
    path: '/contest/$label',
    title: msg`Name contest`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One contest: status, tally, contenders with prefunded balance and who voted.`,
    sources: ['sdk', 'pe'],
    record: msg`contest`,
  }),
  page({
    path: '/votes',
    title: msg`Masternode votes`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Every masternode vote with voter, choice, resource and time.`,
    sources: ['pe'],
    nav: true,
    group: 'voting',
  }),
  page({
    path: '/polls',
    title: msg`Vote polls`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Upcoming vote polls by end date.`,
    sources: ['sdk'],
    nav: true,
    group: 'voting',
  }),
  page({
    path: '/groups/$contract',
    title: msg`Groups`,
    section: 'platform',
    layer: 'platform',
    summary: msg`A contract’s groups with position, threshold and members.`,
    sources: ['sdk'],
    record: msg`contract`,
  }),
  page({
    path: '/group/$contract/$pos',
    title: msg`Group`,
    section: 'platform',
    layer: 'platform',
    summary: msg`One group: members by power and its active and closed actions with signers.`,
    sources: ['sdk'],
    record: msg`group`,
  }),
  page({
    path: '/quorums',
    title: msg`Quorums`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Current Platform quorums with size, members and the last proposer.`,
    sources: ['sdk', 'pe'],
    nav: true,
    group: 'chain',
  }),
  page({
    path: '/credits',
    title: msg`Credits`,
    section: 'platform',
    layer: 'platform',
    summary: msg`Total credits in Platform, with a fiat estimate, and prefunded specialised balances.`,
    sources: ['sdk', 'rate'],
    nav: true,
    group: 'chain',
  }),
  page({
    path: '/shielded',
    title: msg`Shielded pool`,
    section: 'platform',
    layer: 'platform',
    summary: msg`The shielded pool’s state, anchors, encrypted notes and a nullifier lookup.`,
    sources: ['sdk'],
    nav: true,
    keywords: ['privacy', 'orchard'],
    group: 'chain',
  }),
  page({
    path: '/platform-address/$addr',
    title: msg`Platform address`,
    section: 'platform',
    layer: 'platform',
    summary: msg`A Platform address’s balance and nonce, proof-checked, and its transitions.`,
    sources: ['sdk', 'pe'],
    record: msg`Platform address`,
  }),

  page({
    path: '/query',
    title: msg`Query`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Run read-only SQL over a contract’s documents, with presets, saved queries and shareable links.`,
    sources: ['sdk'],
    nav: true,
    keywords: ['sql', 'documents'],
  }),
  page({
    path: '/tools/transition',
    title: msg`Transition decoder`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Paste a state transition as hex or base64 to decode it. Nothing is signed or broadcast; the optional check sends the transition to Platform Explorer for a dry run.`,
    sources: ['local', 'sdk', 'pe'],
    nav: true,
    keywords: ['decode', 'dry-run'],
    railTitle: msg`Transition`,
  }),
  page({
    path: '/tools/$decoder',
    title: msg`Decoder`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Decode raw bytes offline: a transaction, block, identity, contract, document or proof.`,
    sources: ['local'],
    record: msg`decoder`,
    navHref: '/tools/contract',
    railTitle: msg`Decoders`,
  }),
  page({
    path: '/tools/verify-message',
    title: msg`Verify message`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Check a signed message against a Core address, in your browser.`,
    sources: ['local'],
    nav: true,
    keywords: ['signature'],
  }),
  page({
    path: '/tools/qr',
    title: msg`QR reader`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Scan or upload a QR code and open what it holds: an address, a payment link or a key hash.`,
    sources: ['local'],
    nav: true,
    keywords: ['scan'],
  }),
  page({
    path: '/sdk-reference',
    title: msg`SDK reference`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Which Platform SDK call backs each Radar page, with its arguments.`,
    sources: ['local'],
    nav: true,
  }),
  page({
    path: '/api',
    title: msg`Radar API`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`The public API behind the node census and masternode pages, with examples.`,
    sources: ['radar'],
    nav: true,
    keywords: ['docs', 'endpoints'],
  }),
  page({
    path: '/sources',
    title: msg`Data sources`,
    section: 'tools',
    layer: 'neutral',
    summary: msg`Every backend Radar can contact, who runs it, and the switch for Decentralized only mode.`,
    sources: ['local'],
    nav: true,
    keywords: ['provenance', 'trust', 'decentralized', 'backends', 'hosts', 'privacy'],
  }),

  page({
    path: '/saved',
    title: msg`Saved`,
    section: 'you',
    layer: 'neutral',
    summary: msg`Identities, contracts, tokens and masternodes you saved. They stay in this browser.`,
    sources: ['local'],
    nav: true,
    keywords: ['bookmarks', 'favourites'],
  }),
  page({
    path: '/settings',
    title: msg`Settings`,
    section: 'you',
    layer: 'neutral',
    summary: msg`Language, units, time zone, connection options and custom devnets.`,
    sources: ['local'],
    nav: true,
    keywords: ['language', 'units', 'devnet'],
  }),
  page({
    path: '/about',
    title: msg`About`,
    section: 'you',
    layer: 'neutral',
    summary: msg`What Radar can and can’t prove, where to act on what you see, and what it remembers.`,
    sources: ['local'],
    nav: true,
    keywords: ['privacy', 'proofs'],
  }),
]

export const SITE_GROUPS: Record<SiteGroup, { title: MessageDescriptor; pages: string[] }> = {
  voting: { title: msg`Voting`, pages: ['/contests', '/votes', '/polls'] },
  chain: { title: msg`Chain state`, pages: ['/quorums', '/credits', '/shielded'] },
}

const BY_PATH = new Map(SITE_MAP.map((p) => [p.path, p]))

export function normalizeRoutePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function findPage(routeId: string): SitePage | undefined {
  return BY_PATH.get(normalizeRoutePath(routeId))
}

export function pagesInSection(section: SiteSection): SitePage[] {
  return SITE_MAP.filter((p) => p.section === section && p.nav)
}

/** One link in a section's rail: a page, or a group of pages under one link. */
export interface RailEntry {
  key: string
  title: MessageDescriptor
  /** The route id to link to (a group's first page). */
  to: string
  /** The URL to link to when the route has params. */
  href?: string
  /** Every page that makes the entry current. */
  pages: string[]
}

/** The section rail: one entry per page, one per group (at its first page's place), no aliases. */
export function railEntries(section: SiteSection): RailEntry[] {
  const seen = new Set<SiteGroup>()
  const entries: RailEntry[] = []
  for (const p of SITE_MAP) {
    if (p.section !== section || p.rail === false || !(p.nav || p.navHref)) continue
    if (p.group) {
      if (seen.has(p.group)) continue
      seen.add(p.group)
      const { title, pages } = SITE_GROUPS[p.group]
      entries.push({ key: `group:${p.group}`, title, to: pages[0]!, pages })
    } else {
      entries.push({
        key: p.path,
        title: p.railTitle ?? p.title,
        to: p.path,
        ...(p.navHref ? { href: p.navHref } : {}),
        pages: [p.path],
      })
    }
  }
  return entries
}

/** The section's entry page: the first listed page, or the section's own route. */
export const SECTION_ENTRY: Record<SiteSection, string> = {
  home: '/',
  search: '/search',
  core: '/blocks',
  network: '/nodes',
  platform: '/platform',
  tools: '/query',
  you: '/settings',
}

const SECTION_OF_SEGMENT: Record<string, SiteSection> = {
  '': 'home',
  search: 'search',
  blocks: 'core',
  block: 'core',
  tx: 'core',
  address: 'core',
  mempool: 'core',
  'rich-list': 'core',
  charts: 'core',
  internals: 'core',
  governance: 'core',
  status: 'core',
  nodes: 'network',
  masternodes: 'network',
  mn: 'network',
  map: 'network',
  epochs: 'network',
  epoch: 'network',
  protocol: 'network',
  v24: 'network',
  changes: 'network',
  validators: 'network',
  platform: 'platform',
  identities: 'platform',
  identity: 'platform',
  contracts: 'platform',
  contract: 'platform',
  document: 'platform',
  tokens: 'platform',
  token: 'platform',
  names: 'platform',
  name: 'platform',
  contests: 'platform',
  contest: 'platform',
  votes: 'platform',
  polls: 'platform',
  groups: 'platform',
  group: 'platform',
  credits: 'platform',
  shielded: 'platform',
  'platform-address': 'platform',
  quorums: 'platform',
  query: 'tools',
  tools: 'tools',
  'sdk-reference': 'tools',
  api: 'tools',
  sources: 'tools',
  saved: 'you',
  settings: 'you',
  about: 'you',
}

export function sectionOfPath(pathname: string): SiteSection {
  const first = pathname.split('/')[1] ?? ''
  return SECTION_OF_SEGMENT[first] ?? 'home'
}
