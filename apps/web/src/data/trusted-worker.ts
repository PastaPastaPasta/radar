interface TrustedPolicy {
  createScriptURL(input: string): unknown
}
interface TrustedPolicyFactory {
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): TrustedPolicy
}

let policy: TrustedPolicy | undefined

/**
 * A script URL the browser accepts for `new Worker(...)` under `require-trusted-types-for 'script'`.
 * Only same-origin URLs pass, so the policy can't be used to load code from elsewhere.
 * Import the worker as `./x.worker.ts?worker&url` and pass `new URL(thatUrl, location.href)`: Vite only
 * bundles a worker it finds as `new Worker(new URL(...))`, and a wrapped `new URL` would be inlined as data.
 */
export function trustedWorkerUrl(url: URL): string | URL {
  const factory = (globalThis as { trustedTypes?: TrustedPolicyFactory }).trustedTypes
  if (!factory) return url
  policy ??= factory.createPolicy('radar-worker', {
    createScriptURL: (value) => {
      if (new URL(value, location.href).origin !== location.origin) {
        throw new Error('Worker scripts must come from this origin')
      }
      return value
    },
  })
  return policy.createScriptURL(url.href) as string
}
