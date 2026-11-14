/**
 * Pages that open with their claim. The headline is the page's name until the data lands, and stays the name where a
 * source is down or the mode leaves the data out; then it is one live sentence. `CLAIM` matches the sentence alone,
 * `H1` either.
 */
export const CLAIM = {
  nodes: /^[\d,]+ Dash nodes? answered the last crawl$/,
  masternodes:
    /^[\d,]+ of [\d,]+ (enabled masternodes? answered the last crawl|masternodes? (is|are) enabled)$/,
  platform: /^Epoch [\d,]+ is \d+% through$/,
  epochs: /^Epoch [\d,]+ is \d+% through$/,
  map: /^[\d,]+ masternodes? in \d+ countr(y|ies)$/,
  changes: /^([\d,]+ changes?|No changes) to the masternode list in the last 24 hours$/,
  v24: /^(Core 24 is |Miners are signalling for Core 24$|Core 24 did not activate$)/,
  blocks: /^The latest block was mined .+$/,
  mempool: /^([\d,]+ transactions? (is|are)|No transactions are) waiting for a block$/,
  governance: /^[\d,]+ of [\d,]+ open proposals? ha(s|ve) the votes to be funded$/,
  status:
    /^(Every source is answering|DAPI and the Platform SDK are answering|Some sources (are slow or behind|aren’t answering))$/,
} as const

const either = (name: string, claim: RegExp) => new RegExp(`^${name}$|${claim.source}`)

export const H1 = {
  nodes: either('Nodes', CLAIM.nodes),
  masternodes: either('Masternodes', CLAIM.masternodes),
  platform: either('Platform', CLAIM.platform),
  epochs: either('Epochs', CLAIM.epochs),
  map: either('Map', CLAIM.map),
  changes: either('Changes', CLAIM.changes),
  v24: either('Core 24 activation', CLAIM.v24),
  blocks: either('Blocks', CLAIM.blocks),
  mempool: either('Mempool', CLAIM.mempool),
  governance: either('Governance', CLAIM.governance),
  status: either('Status', CLAIM.status),
} as const
