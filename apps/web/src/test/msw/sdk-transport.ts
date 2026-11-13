import type { SdkTransport } from '@/data/sdk/client'
import type { SdkMethodName, SdkMethods, WireError, WireResult } from '@/data/sdk/methods'
import type { NetworkId } from '@/lib/network'
import { argsKey, decodeValue } from '../fixtures/sdk-codec'
import { listSdkFixtures, loadSdkFixture } from '../fixtures/sdk-load'
import { composeSdkAnswer, type SdkRecordings } from './sdk-compose'
import { reportFixtureMiss } from './handlers/fixtures'

/**
 * Serves recorded SDK answers (§10): the worker and the wasm are not involved, and no proof is checked again.
 * A batched call whose grouping was not recorded is composed from the recordings of other groupings when every part of
 * it is covered. Any other call with no recording is reported as a fixture miss and fails the test; it never answers
 * empty.
 */
export class FixtureSdkTransport implements SdkTransport {
  /** Every call served or refused, in order, for tests that assert on what the page asked. */
  readonly calls: { net: NetworkId; method: string; key: string }[] = []

  constructor(private readonly recordings?: SdkRecordings) {}

  connect() {
    return Promise.resolve({ sdkVersion: 'fixture', protocolVersion: 14, tookMs: 0 })
  }

  async call<M extends SdkMethodName>(
    net: NetworkId,
    method: M,
    args: SdkMethods[M]['args'],
  ): Promise<WireResult<SdkMethods[M]['result']> | WireError> {
    const key = argsKey(args)
    this.calls.push({ net, method, key })
    const fixture = await loadSdkFixture(net, method, key)
    if (fixture)
      return decodeValue(fixture.result) as WireResult<SdkMethods[M]['result']> | WireError
    const composed = await composeSdkAnswer(
      this.recordings ?? ((m) => listSdkFixtures(net, m)),
      method,
      args,
    )
    if (composed) return composed as WireResult<SdkMethods[M]['result']>
    const what = `SDK ${method} on ${net} (args ${JSON.stringify(args, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))}, key ${key})`
    reportFixtureMiss(what)
    return {
      ok: false,
      error: { kind: 'network', message: `No recorded SDK fixture for ${what}` },
    }
  }

  decode() {
    return Promise.resolve<WireError>({
      ok: false,
      error: { kind: 'unavailable', message: 'Local decoding is not recorded in fixtures' },
    })
  }
}

/** For unit tests of pages that read the SDK: installs the fixture transport and returns it. */
export async function installFixtureSdk(): Promise<FixtureSdkTransport> {
  const { setSdkTransport } = await import('@/data/sdk/client')
  const transport = new FixtureSdkTransport()
  setSdkTransport(() => Promise.resolve(transport))
  return transport
}
