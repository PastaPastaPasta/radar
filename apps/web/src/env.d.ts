declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'fixtures'
  readonly VITE_RADAR_KIT?: '1'
}

declare module 'virtual:radar-sdk-wasm-parts' {
  /** The wasm's pieces in order, each with the SHA-256 (hex) of its bytes, fixed when the app was built. */
  const parts: { url: string; sha256: string }[]
  export default parts
}
