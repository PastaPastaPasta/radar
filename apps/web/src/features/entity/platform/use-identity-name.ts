/**
 * The DPNS name to show for an identity, once the `dpnsName` batcher exists. Every identity reference reads it here, so
 * wiring the batcher in changes this one function and no page.
 */
export function useIdentityName(id: string): string | undefined {
  void id
  return undefined
}
