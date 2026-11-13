import type {
  ContractFullDto,
  ContractGroupDto,
  ContractIndexDto,
  ContractTokenDto,
  CurrentQuorumsDto,
  DocumentDto,
  DpnsUsernameDto,
  EpochDto,
  FinalizedEpochDto,
  IdentityDto,
  IdentityKeyDto,
  IdentityTokenInfoDto,
  PlatformAddressInfoDto,
  PlatformStatusDto,
  ContractDto,
  TokenContractInfoDto,
  TokenStatusDto,
  VersionUpgradeStateDto,
  VotePollDto,
  VotePollsByEndDateDto,
} from '../methods'
import { base58Decode, base58Encode } from '@/lib/base58'
import { decodePlatformAddress } from '@/lib/bech32'
import { bytesToHex } from '@/lib/hex'
import type { Freeable } from './impl/types'

interface IdentityKeyLike extends Freeable {
  keyId: number
  keyTypeNumber: number
  purposeNumber: number
  securityLevelNumber: number
  isReadOnly: boolean
  disabledAt?: bigint | number | null
  data: Uint8Array
}

export interface IdentityLike extends Freeable {
  id: { toString(): string } | string
  balance: bigint
  revision: bigint | number
  publicKeys: IdentityKeyLike[]
}

export interface ContractLike extends Freeable {
  id: { toString(): string } | string
  ownerId: { toString(): string } | string
  version: number | bigint
  toJSON(): { documentSchemas?: Record<string, unknown> }
}

export interface EpochLike extends Freeable {
  toJSON(): {
    index: number
    firstBlockTime: number | bigint
    firstBlockHeight: number | bigint
    firstCoreBlockHeight: number | bigint
    feeMultiplierPermille: number | bigint
    protocolVersion: number
  }
}

export interface StatusLike {
  toJSON(): {
    version?: {
      software?: { dapi?: string; drive?: string; tenderdash?: string }
      protocol?: {
        tenderdash?: { p2p?: number; block?: number }
        drive?: { latest?: number; current?: number }
      }
    }
    node?: { id?: string; proTxHash?: string }
    chain?: {
      isCatchingUp?: boolean
      latestBlockHash?: string
      latestAppHash?: string
      latestBlockHeight?: string | number
      earliestBlockHeight?: string | number
      maxPeerBlockHeight?: string | number
      coreChainLockedHeight?: number
    }
    network?: { chainId?: string; peersCount?: number; isListening?: boolean }
    time?: { block?: string | number; epoch?: number }
  }
}

export function identityDto(identity: IdentityLike): IdentityDto {
  const keys: IdentityKeyDto[] = identity.publicKeys.map((k) => {
    const out: IdentityKeyDto = {
      id: k.keyId,
      type: k.keyTypeNumber,
      purpose: k.purposeNumber,
      securityLevel: k.securityLevelNumber,
      readOnly: k.isReadOnly,
      data: Uint8Array.from(k.data),
    }
    if (k.disabledAt !== undefined && k.disabledAt !== null) out.disabledAt = Number(k.disabledAt)
    return out
  })
  return {
    id: String(identity.id),
    balance: identity.balance,
    revision: Number(identity.revision),
    keys,
  }
}

export function contractDto(contract: ContractLike): ContractDto {
  return {
    id: String(contract.id),
    ownerId: String(contract.ownerId),
    version: Number(contract.version),
    documentSchemas: contract.toJSON().documentSchemas ?? {},
  }
}

export function epochDto(epoch: EpochLike): EpochDto {
  const j = epoch.toJSON()
  return {
    index: j.index,
    firstBlockTimeMs: Number(j.firstBlockTime),
    firstBlockHeight: Number(j.firstBlockHeight),
    firstCoreBlockHeight: Number(j.firstCoreBlockHeight),
    feeMultiplierPermille: Number(j.feeMultiplierPermille),
    protocolVersion: j.protocolVersion,
  }
}

export interface StatusDto {
  dto: PlatformStatusDto
  coreChainLockedHeight: number
  epoch: number
  protocolVersion: number
}

export function statusDto(status: StatusLike): StatusDto {
  const j = status.toJSON()
  const dto: PlatformStatusDto = {
    chainId: j.network?.chainId ?? '',
    version: j.version?.software?.drive ?? '',
    height: Number(j.chain?.latestBlockHeight ?? 0),
    timeMs: Number(j.time?.block ?? 0),
    catchingUp: j.chain?.isCatchingUp === true,
    peers: j.network?.peersCount ?? 0,
    isListening: j.network?.isListening === true,
    latestBlockHash: j.chain?.latestBlockHash ?? '',
    latestAppHash: j.chain?.latestAppHash ?? '',
    earliestBlockHeight: Number(j.chain?.earliestBlockHeight ?? 0),
    maxPeerBlockHeight: Number(j.chain?.maxPeerBlockHeight ?? 0),
    coreChainLockedHeight: j.chain?.coreChainLockedHeight ?? 0,
    nodeProTxHash: j.node?.proTxHash ?? '',
    nodeId: j.node?.id ?? '',
    dapiVersion: j.version?.software?.dapi ?? '',
    tenderdashVersion: j.version?.software?.tenderdash ?? '',
    tenderdashProtocol: {
      p2p: j.version?.protocol?.tenderdash?.p2p ?? 0,
      block: j.version?.protocol?.tenderdash?.block ?? 0,
    },
    driveProtocol: {
      latest: j.version?.protocol?.drive?.latest ?? 0,
      current: j.version?.protocol?.drive?.current ?? 0,
    },
  }
  return {
    dto,
    coreChainLockedHeight: dto.coreChainLockedHeight,
    epoch: j.time?.epoch ?? 0,
    protocolVersion: j.version?.protocol?.drive?.current ?? 0,
  }
}

/** Chain ids are short ASCII ("evo1", "dash-testnet-51"); anything else is shown as hex. */
export function chainIdText(bytes: Uint8Array): string {
  const printable = bytes.length > 0 && bytes.every((b) => b >= 0x20 && b < 0x7f)
  return printable
    ? String.fromCharCode(...bytes)
    : Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

type IdLike = { toString(): string } | string

type IdBytes = Uint8Array | readonly number[]

/** An identifier as base58 text: the SDK hands some of them over as raw bytes (a plain array of numbers). */
export function idText(id: IdLike | IdBytes): string {
  if (id instanceof Uint8Array) return base58Encode(id)
  return Array.isArray(id) ? base58Encode(Uint8Array.from(id as readonly number[])) : String(id)
}

export interface DocumentLike extends Freeable {
  id: IdLike
  ownerId: IdLike
  dataContractId: IdLike
  documentTypeName: string
  revision?: bigint | number | null
  createdAt?: bigint | number | null
  updatedAt?: bigint | number | null
  transferredAt?: bigint | number | null
  createdAtBlockHeight?: bigint | number | null
  updatedAtBlockHeight?: bigint | number | null
  transferredAtBlockHeight?: bigint | number | null
  createdAtCoreBlockHeight?: number | null
  updatedAtCoreBlockHeight?: number | null
  transferredAtCoreBlockHeight?: number | null
  properties: Record<string, unknown>
}

const num = (v: bigint | number | null | undefined): number | null =>
  v === undefined || v === null ? null : Number(v)

const big = (v: bigint | number | null | undefined): bigint | null =>
  v === undefined || v === null ? null : BigInt(v)

export function documentDto(doc: DocumentLike): DocumentDto {
  return {
    id: String(doc.id),
    ownerId: String(doc.ownerId),
    contractId: String(doc.dataContractId),
    type: doc.documentTypeName,
    revision: big(doc.revision),
    createdAt: num(doc.createdAt),
    updatedAt: num(doc.updatedAt),
    transferredAt: num(doc.transferredAt),
    createdAtBlockHeight: num(doc.createdAtBlockHeight),
    updatedAtBlockHeight: num(doc.updatedAtBlockHeight),
    transferredAtBlockHeight: num(doc.transferredAtBlockHeight),
    createdAtCoreBlockHeight: num(doc.createdAtCoreBlockHeight),
    updatedAtCoreBlockHeight: num(doc.updatedAtCoreBlockHeight),
    transferredAtCoreBlockHeight: num(doc.transferredAtCoreBlockHeight),
    data: { ...doc.properties },
  }
}

export interface DpnsUsernameLike extends Freeable {
  username: string
  identityId: IdLike | IdBytes
  documentId: IdLike | IdBytes
}

export function dpnsUsernameDto(info: DpnsUsernameLike): DpnsUsernameDto {
  return {
    username: info.username,
    identityId: idText(info.identityId),
    documentId: idText(info.documentId),
  }
}

export interface FullContractLike extends ContractLike {
  toJSON(): {
    documentSchemas?: Record<string, unknown>
    config?: Record<string, unknown>
    groups?: Record<string, unknown>
    tokens?: Record<string, unknown>
  }
}

function indexDto(raw: unknown): ContractIndexDto | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as { name?: unknown; properties?: unknown; unique?: unknown; contested?: unknown }
  if (typeof o.name !== 'string') return undefined
  const properties = Array.isArray(o.properties)
    ? o.properties.flatMap((p: unknown) => {
        if (!p || typeof p !== 'object') return []
        const [field, order] = Object.entries(p as Record<string, unknown>)[0] ?? []
        return field
          ? [{ field, order: order === 'desc' ? ('desc' as const) : ('asc' as const) }]
          : []
      })
    : []
  return { name: o.name, properties, unique: o.unique === true, contested: !!o.contested }
}

function groupDto(position: string, raw: unknown): ContractGroupDto {
  const o = (raw && typeof raw === 'object' ? raw : {}) as {
    members?: Record<string, unknown>
    requiredPower?: unknown
  }
  return {
    position: Number(position),
    requiredPower: Number(o.requiredPower ?? 0),
    members: Object.entries(o.members ?? {}).map(([id, power]) => ({ id, power: Number(power) })),
  }
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

export function contractFullDto(contract: FullContractLike): ContractFullDto {
  const json = contract.toJSON()
  const schemas = json.documentSchemas ?? {}
  const config = json.config ?? {}
  const indices: Record<string, ContractIndexDto[]> = {}
  for (const [type, schema] of Object.entries(schemas)) {
    const raw = (schema as { indices?: unknown } | null)?.indices
    indices[type] = Array.isArray(raw)
      ? raw.flatMap((i: unknown) => {
          const dto = indexDto(i)
          return dto ? [dto] : []
        })
      : []
  }
  const tokens: ContractTokenDto[] = Object.entries(json.tokens ?? {})
    .map(([position, cfg]) => ({
      position: Number(position),
      config: (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>,
    }))
    .sort(byPosition)
  const groups = Object.entries(json.groups ?? {})
    .map(([position, raw]) => groupDto(position, raw))
    .sort(byPosition)
  return {
    ...contractDto(contract),
    documentSchemas: schemas,
    keepsHistory: config.keepsHistory === true,
    config,
    indices,
    tokens,
    groups,
  }
}

export interface TokenContractInfoLike extends Freeable {
  contractId: IdLike
  tokenContractPosition: number
}

export const tokenContractInfoDto = (info: TokenContractInfoLike): TokenContractInfoDto => ({
  contractId: String(info.contractId),
  position: info.tokenContractPosition,
})

export const tokenStatusDto = (status: { isPaused: boolean } & Freeable): TokenStatusDto => ({
  paused: status.isPaused,
})

export const identityTokenInfoDto = (
  info: { isFrozen: boolean } & Freeable,
): IdentityTokenInfoDto => ({ frozen: info.isFrozen })

export interface FinalizedEpochLike extends Freeable {
  index?: number
  firstBlockTime: bigint | number
  firstBlockHeight: bigint | number
  firstCoreBlockHeight: number | bigint
  feeMultiplierPermille: bigint | number
  protocolVersion: number
  totalBlocksInEpoch: bigint | number
  coreBlockRewards: bigint
  totalProcessingFees: bigint
  totalDistributedStorageFees: bigint
  totalCreatedStorageFees: bigint
  nextEpochStartCoreBlockHeight: number
  blockProposers: Map<string, bigint>
}

/** A finalized epoch carries no index of its own: the map key it came under is the index. */
export function finalizedEpochDto(index: number, epoch: FinalizedEpochLike): FinalizedEpochDto {
  return {
    index,
    firstBlockTimeMs: Number(epoch.firstBlockTime),
    firstBlockHeight: Number(epoch.firstBlockHeight),
    firstCoreBlockHeight: Number(epoch.firstCoreBlockHeight),
    feeMultiplierPermille: Number(epoch.feeMultiplierPermille),
    protocolVersion: epoch.protocolVersion,
    totalBlocks: Number(epoch.totalBlocksInEpoch),
    coreBlockRewards: epoch.coreBlockRewards,
    totalProcessingFees: epoch.totalProcessingFees,
    totalDistributedStorageFees: epoch.totalDistributedStorageFees,
    totalCreatedStorageFees: epoch.totalCreatedStorageFees,
    nextEpochStartCoreBlockHeight: epoch.nextEpochStartCoreBlockHeight,
    blockProposers: hexKeyed(epoch.blockProposers),
  }
}

export interface VersionUpgradeStateLike extends Freeable {
  currentProtocolVersion: number
  nextProtocolVersion?: number | null
  voteCount?: bigint | number | null
}

export const versionUpgradeStateDto = (s: VersionUpgradeStateLike): VersionUpgradeStateDto => ({
  currentProtocolVersion: s.currentProtocolVersion,
  nextProtocolVersion: s.nextProtocolVersion ?? null,
  voteCount: big(s.voteCount),
})

export interface CurrentQuorumsLike extends Freeable {
  height: bigint | number
  quorums: {
    quorumHash: string
    quorumType: string
    memberCount: number
    threshold: number
    isVerified: boolean
  }[]
}

export const currentQuorumsDto = (info: CurrentQuorumsLike): CurrentQuorumsDto => ({
  height: Number(info.height),
  quorums: info.quorums.map((q) => ({
    quorumHash: q.quorumHash,
    quorumType: q.quorumType,
    memberCount: q.memberCount,
    threshold: q.threshold,
    isVerified: q.isVerified,
  })),
})

export interface VotePollsEntryLike extends Freeable {
  timestampMs: bigint | number
  votePolls: unknown[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function votePollDto(raw: unknown): VotePollDto | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const poll = (
    typeof (raw as { toJSON?: unknown }).toJSON === 'function'
      ? (raw as { toJSON(): unknown }).toJSON()
      : raw
  ) as Record<string, unknown>
  return {
    contractId: str(poll.contractId),
    documentTypeName: str(poll.documentTypeName),
    indexName: str(poll.indexName),
    indexValues: Array.isArray(poll.indexValues) ? [...(poll.indexValues as unknown[])] : [],
  }
}

export const votePollsByEndDateDto = (entry: VotePollsEntryLike): VotePollsByEndDateDto => ({
  timestampMs: Number(entry.timestampMs),
  polls: entry.votePolls.flatMap((p) => {
    const dto = votePollDto(p)
    return dto ? [dto] : []
  }),
})

export interface PlatformAddressInfoLike extends Freeable {
  balance: bigint
  nonce: bigint | number
}

/** The address is the one the caller asked about: the SDK keys its answers by it, and the text form needs the network. */
export const platformAddressInfoDto = (
  address: string,
  info: PlatformAddressInfoLike,
): PlatformAddressInfoDto => ({ address, balance: info.balance, nonce: BigInt(info.nonce) })

const HEX64 = /^[0-9a-f]{64}$/i

/** A proposer's ProTxHash as 64 lower-case hex characters, whichever form the SDK keyed it in (base58 identifier or hex). */
export function proTxHashHex(key: string): string {
  if (HEX64.test(key)) return key.toLowerCase()
  try {
    const bytes = base58Decode(key)
    return bytes.length === 32 ? bytesToHex(bytes) : key
  } catch {
    return key
  }
}

export function hexKeyed<V>(entries: Iterable<[string, V]>): Map<string, V> {
  return new Map([...entries].map(([k, v]) => [proTxHashHex(k), v]))
}

/** The key the SDK answers a Platform address under: a type byte (0 for P2PKH, 1 for P2SH) and the 20-byte hash, in hex. */
export function platformAddressKey(address: string): string {
  const parts = decodePlatformAddress(address)
  return parts ? `${parts.type === 'p2pkh' ? '00' : '01'}${bytesToHex(parts.hash)}` : address
}
