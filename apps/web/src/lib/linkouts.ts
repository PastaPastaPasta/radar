import type { NetworkId } from './network'

export type LinkOutTarget =
  | {
      app: 'bridge'
      action: 'identity' | 'name' | 'token' | 'contract' | 'platform-address'
      id: string
      net: NetworkId
    }
  | { app: 'gov'; action: 'contest-vote'; label: string }
  | { app: 'gov'; action: 'proposal'; hash: string }
  | { app: 'pe'; path: string; net: NetworkId }
  | { app: 'hyphen'; path: string; net: NetworkId }
  | { app: 'insight'; path: string; net: NetworkId }

export function linkOutUrl(target: LinkOutTarget): string {
  void target
  throw new Error('not implemented')
}
