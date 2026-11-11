import rawInit from '@dashevo/wasm-sdk/raw'
import wasmParts from 'virtual:radar-sdk-wasm-parts'
import { sha256Stream } from '@/lib/sha256-stream'

export * from '@dashevo/wasm-sdk/raw'

let initialised: Promise<unknown> | undefined

/** One part, hashed as it streams: the stream errors at the end of a part whose bytes are not the ones built, before the compile can finish. */
async function verifiedBody(
  part: { url: string; sha256: string },
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(part.url, { signal })
  if (!response.ok || !response.body) {
    throw new Error(`wasm part ${part.url}: HTTP ${response.status}`)
  }
  const hash = sha256Stream()
  const reader = response.body.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (!chunk.done) {
          hash.update(chunk.value)
          controller.enqueue(chunk.value)
          return
        }
        if (hash.hex() !== part.sha256) {
          throw new Error(`wasm part ${part.url} does not match the build`)
        }
        controller.close()
      } catch (error) {
        controller.error(error)
        throw error
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

/** The pieces of the wasm, fetched together and streamed in order, so the module compiles while it downloads. */
function wasmResponse(): Response {
  const abort = new AbortController()
  const bodies = Promise.all(wasmParts.map((part) => verifiedBody(part, abort.signal)))
  bodies.catch(() => abort.abort())
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const body of await bodies) {
          const reader = body.getReader()
          for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            controller.enqueue(chunk.value)
          }
        }
        controller.close()
      } catch (error) {
        abort.abort()
        controller.error(error)
      }
    },
    cancel: () => abort.abort(),
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/wasm' } })
}

/**
 * Stands in for `@dashevo/wasm-sdk/compressed`: same exports, but the wasm is fetched as separate files. A failed
 * load is not remembered, so the next connect tries again.
 */
export default function init(): Promise<unknown> {
  initialised ??= rawInit({ module_or_path: wasmResponse() }).catch((error: unknown) => {
    initialised = undefined
    throw error
  })
  return initialised
}
