import rawInit from '@dashevo/wasm-sdk/raw'
import wasmParts from 'virtual:radar-sdk-wasm-parts'

export * from '@dashevo/wasm-sdk/raw'

let initialised: Promise<unknown> | undefined

/** The pieces of the wasm, fetched together and streamed in order, so the module compiles while it downloads. */
function wasmResponse(): Response {
  const bodies = Promise.all(
    wasmParts.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok || !response.body)
        throw new Error(`wasm part ${url}: HTTP ${response.status}`)
      return response.body
    }),
  )
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
        controller.error(error)
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/wasm' } })
}

/** Stands in for `@dashevo/wasm-sdk/compressed`: same exports, but the wasm is fetched as separate files. */
export default function init(): Promise<unknown> {
  return (initialised ??= rawInit({ module_or_path: wasmResponse() }))
}
