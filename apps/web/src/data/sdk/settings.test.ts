import { afterEach, describe, expect, it } from 'vitest'
import {
  connectionSettings,
  forgetSdkSettings,
  getSdkSettings,
  parseSdkSettings,
  quorumUrlOverride,
  quorumUrlProblem,
  resetSdkSettings,
  SDK_SETTINGS_KEY,
  setSdkSettings,
} from './settings'

afterEach(() => {
  localStorage.clear()
  forgetSdkSettings()
})

describe('SDK settings', () => {
  it('starts with nothing changed and always sends a log level', () => {
    expect(getSdkSettings()).toEqual({ quorumUrls: {} })
    expect(connectionSettings()).toEqual({ logs: 'warn' })
  })

  it('keeps each valid field and drops each invalid one on its own', () => {
    expect(
      parseSdkSettings({
        quorumUrls: { mainnet: 'https://q.example/', testnet: 'http://insecure.example' },
        requestTimeoutMs: 50,
        retries: 3,
        banFailedAddress: false,
        logLevel: 'verbose',
      }),
    ).toEqual({ quorumUrls: { mainnet: 'https://q.example' }, retries: 3, banFailedAddress: false })
    expect(parseSdkSettings('nonsense')).toEqual({ quorumUrls: {} })
  })

  it('persists under radar.sdk and reads it back', () => {
    setSdkSettings({ quorumUrls: {}, requestTimeoutMs: 15_000, logLevel: 'debug' })
    expect(JSON.parse(localStorage.getItem(SDK_SETTINGS_KEY)!)).toEqual({
      quorumUrls: {},
      requestTimeoutMs: 15_000,
      logLevel: 'debug',
    })
    forgetSdkSettings()
    expect(connectionSettings()).toEqual({ timeoutMs: 15_000, logs: 'debug' })
    resetSdkSettings()
    expect(connectionSettings()).toEqual({ logs: 'warn' })
  })

  it('applies a quorum override to the built-in networks only', () => {
    setSdkSettings({ quorumUrls: { testnet: 'https://q.example' } })
    expect(quorumUrlOverride('testnet')).toBe('https://q.example')
    expect(quorumUrlOverride('mainnet')).toBeUndefined()
    expect(quorumUrlOverride('devnet-ruby')).toBeUndefined()
  })

  it('says what is wrong with a quorum address', () => {
    expect(quorumUrlProblem('https://q.example/path')).toBeUndefined()
    expect(quorumUrlProblem('http://q.example')).toBe('scheme')
    expect(quorumUrlProblem('https://user:pw@q.example')).toBe('invalid')
    expect(quorumUrlProblem('not a url')).toBe('invalid')
  })
})
