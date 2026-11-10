import type { DevnetConfig } from '@/lib/network'

let source: () => readonly DevnetConfig[] = () => []

/** Where the SDK client finds the saved devnets. Kept apart from the client so the entry can register it without pulling the client in. */
export function setSdkDevnets(next: () => readonly DevnetConfig[]): void {
  source = next
}

export const sdkDevnets = (): readonly DevnetConfig[] => source()
