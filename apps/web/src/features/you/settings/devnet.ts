import type { DevnetConfig } from '@/lib/network'

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const ADDRESS = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\]):\d{1,5}$/i

export type DevnetFormError = 'name' | 'exists' | 'addresses' | 'quorum'

export function splitAddresses(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseDevnetForm(
  input: { name: string; addresses: string; quorumUrl: string },
  options: { checkName: boolean; existing?: readonly string[] },
): { config: DevnetConfig } | { error: DevnetFormError } {
  const name = input.name
    .trim()
    .toLowerCase()
    .replace(/^devnet-/, '')
  if (options.checkName && !NAME.test(name)) return { error: 'name' }
  if (options.checkName && options.existing?.includes(name)) return { error: 'exists' }
  const dapiAddresses = splitAddresses(input.addresses)
  if (dapiAddresses.length === 0 || !dapiAddresses.every((a) => ADDRESS.test(a))) {
    return { error: 'addresses' }
  }
  const quorumUrl = input.quorumUrl.trim()
  if (quorumUrl && !/^https:\/\/\S+$/.test(quorumUrl)) return { error: 'quorum' }
  return { config: { name, dapiAddresses, ...(quorumUrl && { quorumUrl }) } }
}
