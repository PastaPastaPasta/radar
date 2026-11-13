import { useEffect, useState } from 'react'
import { sdk } from '@/data/sdk'
import type { SdkDecodeKind, SdkDecodeOptions } from '@/data/sdk/methods'
import type { ParsedBytes } from './bytes'

export type Decoded =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ok'; data: unknown }
  | { status: 'error'; message: string }

interface Finished {
  kind: SdkDecodeKind
  bytes: Uint8Array
  contract: Uint8Array | undefined
  type: string | undefined
  state: Decoded
}

/**
 * Decodes pasted bytes in the SDK's wasm, locally: nothing leaves the browser. The bytes are only ever
 * held in this state and handed to the worker; they never reach the address, storage or a log.
 */
export function useDecoded(
  kind: SdkDecodeKind,
  parsed: ParsedBytes | undefined,
  opts?: SdkDecodeOptions,
  enabled = true,
): Decoded {
  const [finished, setFinished] = useState<Finished | undefined>()
  const bytes = parsed?.ok ? parsed.bytes : undefined
  const contract = opts?.contract
  const type = opts?.type
  const active = bytes !== undefined && enabled

  useEffect(() => {
    if (!bytes || !enabled) return
    let live = true
    const done = (state: Decoded) => {
      if (live) setFinished({ kind, bytes, contract, type, state })
    }
    sdk.decode(kind, bytes, { ...(contract ? { contract } : {}), ...(type ? { type } : {}) }).then(
      (result) => {
        done(
          result.ok
            ? { status: 'ok', data: result.data }
            : { status: 'error', message: result.error.message },
        )
      },
      (error: unknown) => {
        done({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      live = false
    }
  }, [kind, bytes, contract, type, enabled])

  if (!active) return { status: 'idle' }
  const current =
    finished?.kind === kind &&
    finished.bytes === bytes &&
    finished.contract === contract &&
    finished.type === type
  return current ? finished.state : { status: 'pending' }
}
