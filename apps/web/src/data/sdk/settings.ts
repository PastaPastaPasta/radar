import { createJsonStore, type JsonStore } from '@/lib/json-store'
import { isDevnet, type NetworkId } from '@/lib/network'
import type { SdkConnectionSettings } from './methods'

export const SDK_SETTINGS_KEY = 'radar.sdk'

/** The levels the SDK's `logs` option takes. Every connection sends one explicitly: the filter is global to the wasm. */
export const SDK_LOG_LEVELS = ['off', 'error', 'warn', 'info', 'debug', 'trace'] as const
export type SdkLogLevel = (typeof SDK_LOG_LEVELS)[number]
export const DEFAULT_LOG_LEVEL: SdkLogLevel = 'warn'

export const SDK_LIMITS = {
  requestTimeoutMs: { min: 100, max: 300_000 },
  retries: { min: 0, max: 20 },
} as const

export type QuorumNetwork = 'mainnet' | 'testnet'

/** What the viewer changed; a field that is absent keeps the SDK's own default. */
export interface SdkSettings {
  quorumUrls: Partial<Record<QuorumNetwork, string>>
  requestTimeoutMs?: number
  retries?: number
  banFailedAddress?: boolean
  logLevel?: SdkLogLevel
}

export const DEFAULT_SDK_SETTINGS: SdkSettings = { quorumUrls: {} }

const intIn = (v: unknown, { min, max }: { min: number; max: number }): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined

/** Whether the text is a quorum service address Radar will pass to the SDK: https, no credentials, no query. */
export function quorumUrlProblem(text: string): 'scheme' | 'invalid' | undefined {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'invalid'
  }
  if (url.protocol !== 'https:') return 'scheme'
  if (url.username || url.password || url.search || url.hash || !url.hostname) return 'invalid'
  return undefined
}

export const normalizeQuorumUrl = (text: string): string => text.trim().replace(/\/+$/, '')

function parseQuorumUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const text = normalizeQuorumUrl(v)
  return text !== '' && quorumUrlProblem(text) === undefined ? text : undefined
}

/** Reads whatever storage holds; each invalid field falls back to its default on its own. */
export function parseSdkSettings(raw: unknown): SdkSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SDK_SETTINGS
  const r = raw as Record<string, unknown>
  const urls = typeof r.quorumUrls === 'object' && r.quorumUrls !== null ? r.quorumUrls : {}
  const quorumUrls: SdkSettings['quorumUrls'] = {}
  const mainnet = parseQuorumUrl((urls as Record<string, unknown>).mainnet)
  const testnet = parseQuorumUrl((urls as Record<string, unknown>).testnet)
  if (mainnet) quorumUrls.mainnet = mainnet
  if (testnet) quorumUrls.testnet = testnet
  const requestTimeoutMs = intIn(r.requestTimeoutMs, SDK_LIMITS.requestTimeoutMs)
  const retries = intIn(r.retries, SDK_LIMITS.retries)
  const logLevel = SDK_LOG_LEVELS.find((l) => l === r.logLevel)
  return {
    quorumUrls,
    ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
    ...(retries !== undefined ? { retries } : {}),
    ...(typeof r.banFailedAddress === 'boolean' ? { banFailedAddress: r.banFailedAddress } : {}),
    ...(logLevel ? { logLevel } : {}),
  }
}

let store: JsonStore<SdkSettings> | undefined
const sdkSettingsStore = () => (store ??= createJsonStore(SDK_SETTINGS_KEY, parseSdkSettings))

export const getSdkSettings = (): SdkSettings => sdkSettingsStore().get()
export const subscribeSdkSettings = (cb: () => void): (() => void) =>
  sdkSettingsStore().subscribe(cb)

/** Saves the settings, dropping any field that holds its default. */
export function setSdkSettings(next: SdkSettings): void {
  sdkSettingsStore().set(parseSdkSettings(next))
}

export function resetSdkSettings(): void {
  sdkSettingsStore().set(DEFAULT_SDK_SETTINGS)
}

/** Forgets the in-memory copy so the next read comes from storage; tests use it after clearing storage. */
export function forgetSdkSettings(): void {
  sdkSettingsStore().forget()
}

/** The connection tuning the worker and the SDK take. A level is always sent, because the wasm keeps the last one. */
export function connectionSettings(
  settings: SdkSettings = getSdkSettings(),
): SdkConnectionSettings {
  return {
    ...(settings.requestTimeoutMs !== undefined ? { timeoutMs: settings.requestTimeoutMs } : {}),
    ...(settings.retries !== undefined ? { retries: settings.retries } : {}),
    ...(settings.banFailedAddress !== undefined
      ? { banFailedAddress: settings.banFailedAddress }
      : {}),
    logs: settings.logLevel ?? DEFAULT_LOG_LEVEL,
  }
}

/** The quorum service the viewer chose for a built-in network. Devnets carry theirs in the devnet itself. */
export function quorumUrlOverride(
  net: NetworkId,
  settings: SdkSettings = getSdkSettings(),
): string | undefined {
  if (isDevnet(net)) return undefined
  return settings.quorumUrls[net]
}
