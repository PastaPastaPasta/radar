import type {
  EpochDto,
  IdentityDto,
  IdentityKeyDto,
  PlatformStatusDto,
  ContractDto,
} from '../methods'

/** A wasm object, as far as these mappers read it. */
interface Freeable {
  free?: () => void
}

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
    version?: { software?: { drive?: string }; protocol?: { drive?: { current?: number } } }
    chain?: {
      isCatchingUp?: boolean
      latestBlockHeight?: string | number
      coreChainLockedHeight?: number
    }
    network?: { chainId?: string }
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
  }
  return {
    dto,
    coreChainLockedHeight: j.chain?.coreChainLockedHeight ?? 0,
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
