import { isPlatformId } from '@/lib/base58'

export type IdentityInput = 'empty' | 'identity' | 'protx' | 'invalid'

/** What a filter field holds: PE's voter and towards filters take an identity ID, and anything else is told apart so it can be explained. */
export function classifyIdentityInput(text: string): IdentityInput {
  const value = text.trim()
  if (value === '') return 'empty'
  if (isPlatformId(value)) return 'identity'
  return /^[0-9a-fA-F]{64}$/.test(value) ? 'protx' : 'invalid'
}
