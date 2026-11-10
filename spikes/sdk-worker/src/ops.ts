import type { EvoSDK } from '@dashevo/evo-sdk';
import { base58 } from './convert';

// Whitelist of read operations. The worker never exposes the SDK object itself, so no
// state-transition / write method is reachable from the main thread.
export const DPNS_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

type P = any;
export interface Op {
  proved: (s: EvoSDK, p: P) => Promise<any>; // *WithProof → ProofMetadataResponse
  /** Optional shaping of `.data` after plain(); e.g. byte-array ids to base58. */
  shape?: (data: any) => any;
  plain?: (s: EvoSDK, p: P) => Promise<any>; // plain variant, for the "is it verified anyway" check
}

export const OPS = {
  'identity.fetch': { proved: (s, p) => s.identities.fetchWithProof(p.id), plain: (s, p) => s.identities.fetch(p.id) },
  'identity.balance': { proved: (s, p) => s.identities.balanceWithProof(p.id), plain: (s, p) => s.identities.balance(p.id) },
  'identity.keys': {
    proved: (s, p) => s.identities.getKeysWithProof({ identityId: p.id, request: { type: 'all' } }),
    plain: (s, p) => s.identities.getKeys({ identityId: p.id, request: { type: 'all' } }),
  },
  // getUsernameByName looks up the normalizedLabel as given, so 'pshenmic.dash' misses ('pshenm1c' is stored).
  // Convert the label with the SDK's local homograph helper first.
  'dpns.byName': {
    proved: async (s, p) => s.dpns.getUsernameByNameWithProof(await safeName(s, p.name)),
    plain: async (s, p) => s.dpns.getUsernameByName(await safeName(s, p.name)),
    shape: (d) => (d ? { username: d.username, identityId: base58(d.identityId), documentId: base58(d.documentId) } : d),
  },
  'dpns.usernames': {
    proved: (s, p) => s.dpns.usernamesWithProof({ identityId: p.id, limit: p.limit ?? 5 }),
    plain: (s, p) => s.dpns.usernames({ identityId: p.id, limit: p.limit ?? 5 }),
  },
  'contract.fetch': { proved: (s, p) => s.contracts.fetchWithProof(p.id), plain: (s, p) => s.contracts.fetch(p.id) },
  'documents.query': { proved: (s, p) => s.documents.queryWithProof(p.query), plain: (s, p) => s.documents.query(p.query) },
  'dpns.domainsByPrefix': {
    proved: (s, p) => s.documents.queryWithProof(dpnsPrefix(p)),
    plain: (s, p) => s.documents.query(dpnsPrefix(p)),
  },
  'token.totalSupply': { proved: (s, p) => s.tokens.totalSupplyWithProof(p.id), plain: (s, p) => s.tokens.totalSupply(p.id) },
  'epoch.current': { proved: (s) => s.epoch.currentWithProof(), plain: (s) => s.epoch.current() },
  'epoch.info': {
    proved: (s, p) => s.epoch.epochsInfoWithProof({ startEpoch: p.start, count: p.count ?? 1 }),
    plain: (s, p) => s.epoch.epochsInfo({ startEpoch: p.start, count: p.count ?? 1 }),
  },
  'protocol.upgradeState': { proved: (s) => s.protocol.versionUpgradeStateWithProof(), plain: (s) => s.protocol.versionUpgradeState() },
  'system.totalCredits': { proved: (s) => s.system.totalCreditsInPlatformWithProof(), plain: (s) => s.system.totalCreditsInPlatform() },
} satisfies Record<string, Op>;

async function safeName(s: EvoSDK, name: string): Promise<string> {
  const i = name.lastIndexOf('.');
  const label = i < 0 ? name : name.slice(0, i);
  const parent = i < 0 ? 'dash' : name.slice(i + 1);
  return `${await s.dpns.convertToHomographSafe(label)}.${parent}`;
}

// local equivalent of dpns.convertToHomographSafe for a prefix: lowercase, o→0, i/l→1
const homograph = (x: string) => x.toLowerCase().replace(/o/g, '0').replace(/[il]/g, '1');

function dpnsPrefix(p: { prefix: string; limit?: number; parent?: string }) {
  return {
    dataContractId: DPNS_CONTRACT,
    documentTypeName: 'domain',
    where: [
      ['normalizedParentDomainName', '==', p.parent ?? 'dash'],
      ['normalizedLabel', 'startsWith', homograph(p.prefix)],
    ],
    orderBy: [['normalizedParentDomainName', 'asc'], ['normalizedLabel', 'asc']],
    limit: p.limit ?? 10,
  } as any;
}

export type OpName = keyof typeof OPS;
