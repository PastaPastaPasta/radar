import type * as ZXingReader from 'zxing-wasm/reader'
import readerWasm from 'zxing-wasm/reader/zxing_reader.wasm?url'

type Reader = typeof ZXingReader

let loaded: Promise<Reader> | undefined

function reader(): Promise<Reader> {
  loaded ??= import('zxing-wasm/reader').then((m) => {
    m.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? readerWasm : prefix + path,
      },
    })
    return m
  })
  return loaded
}

const OPTIONS = { formats: ['QRCode' as const], tryHarder: true, maxNumberOfSymbols: 1 }

/** The text of the first QR code found in an image file or a camera frame, or undefined. */
export async function readQr(input: Blob | ImageData): Promise<string | undefined> {
  const { readBarcodes } = await reader()
  const found = await readBarcodes(input, OPTIONS)
  return found.find((r) => r.isValid && r.text !== '')?.text
}
