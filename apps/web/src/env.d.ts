declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'fixtures'
  readonly VITE_RADAR_KIT?: '1'
}

declare module 'virtual:radar-sdk-wasm-parts' {
  const urls: string[]
  export default urls
}
