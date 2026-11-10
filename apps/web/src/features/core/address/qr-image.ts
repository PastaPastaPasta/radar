import writerWasm from 'zxing-wasm/writer/zxing_writer.wasm?url'

/** Draws `text` as a QR code and returns a PNG blob. The encoder loads on first use. */
export async function qrPng(text: string): Promise<Blob> {
  const { writeBarcode, prepareZXingModule } = await import('zxing-wasm/writer')
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? writerWasm : prefix + path) },
  })
  const out = await writeBarcode(text, { format: 'QRCode', scale: 6, withQuietZones: true })
  if (!out.image) throw new Error(out.error || 'The QR code could not be drawn')
  return out.image
}
