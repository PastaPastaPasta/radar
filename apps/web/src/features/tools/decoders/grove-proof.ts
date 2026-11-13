/*
 * The proof parser is the bundled wasm of grovedb-proof-parser (MIT), vendored in ./grovedb-parser; the lazy loading
 * and trap handling follow native-platform-explorer (src/lib/grovedb-proof-parser.ts), MIT License, Copyright (c) 2026
 * native-platform-explorer contributors. See THIRD_PARTY.md.
 */
import wasmUrl from './grovedb-parser/grovedb_proof_parser_bg.wasm?url'

type ParserModule = typeof import('./grovedb-parser/grovedb_proof_parser')

/** Why a proof could not be read: the page words each reason in the reader's language. */
export type ProofParseReason = 'empty' | 'load' | 'trap' | 'truncated' | 'invalid'

export class ProofParseError extends Error {
  constructor(
    readonly reason: ProofParseReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ProofParseError'
  }
}

let loading: Promise<ParserModule> | null = null
/** The compiled module survives a trap, so a fresh instance needs no second download. */
let compiled: WebAssembly.Module | undefined
let generation = 0

function ensureLoaded(source?: BufferSource): Promise<ParserModule> {
  if (!loading) {
    const attempt = (async () => {
      const mod = await import('./grovedb-parser/grovedb_proof_parser')
      if (source) mod.initSync({ module: source })
      else await mod.default({ module_or_path: compiled ?? wasmUrl })
      return mod
    })()
    attempt.catch(() => {
      if (loading === attempt) loading = null
    })
    loading = attempt
  }
  return loading
}

/** Forgets the loaded instance, for tests. */
export function resetGroveParser(): void {
  loading = null
  compiled = undefined
  generation++
}

function failure(error: unknown): ProofParseError {
  if (error instanceof WebAssembly.RuntimeError) {
    return new ProofParseError('trap', 'The parser hit an internal limit', { cause: error })
  }
  const raw = error instanceof Error ? error.message : String(error)
  if (/UnexpectedEnd/.test(raw)) return new ProofParseError('truncated', raw, { cause: error })
  return new ProofParseError('invalid', raw.slice(0, 200), { cause: error })
}

/** The parser's text for one GroveDB proof. Nothing is sent anywhere. `source` is for tests: the wasm bytes. */
export async function parseGroveProof(bytes: Uint8Array, source?: BufferSource): Promise<string> {
  if (bytes.length === 0) throw new ProofParseError('empty', 'No proof bytes')
  let mod: ParserModule
  for (;;) {
    const current = generation
    try {
      mod = await ensureLoaded(source)
    } catch (error) {
      throw new ProofParseError('load', 'The proof parser could not be loaded', { cause: error })
    }
    if (current === generation) break
  }
  try {
    return mod.parse_grovedb_proof(bytes)
  } catch (error) {
    if (error instanceof WebAssembly.RuntimeError) {
      compiled = mod.__resetInstance() ?? compiled
      loading = null
      generation++
    }
    throw failure(error)
  }
}
