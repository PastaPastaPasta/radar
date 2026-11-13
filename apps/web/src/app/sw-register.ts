/** Registers `/sw.js` once the first paint is done. It registers nothing yet: the worker has no fetch handler to offer. */
export function registerServiceWorker(): void {
  // The first thing a worker will do is cache the app shell, which Decentralized only mode must not change. Wire it
  // here, behind that mode's reader, when the worker gains a handler.
}
