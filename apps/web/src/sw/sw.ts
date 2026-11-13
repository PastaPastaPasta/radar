/**
 * Radar's service worker. It has no fetch handler on purpose: until one exists, every request goes to the network as
 * if no worker were installed. The build emits this file as `/sw.js`, outside the app's chunks.
 */
interface WorkerScope {
  addEventListener: (type: 'install', listener: () => void) => void
  skipWaiting: () => Promise<void>
}

const scope = self as unknown as WorkerScope

scope.addEventListener('install', () => {
  void scope.skipWaiting()
})
