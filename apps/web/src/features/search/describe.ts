import type { Classified, InputClass } from './classify'

const NAMES: Record<InputClass, string> = {
  int: 'a number: a Core height, Platform height or epoch',
  hex64: 'a 64-character hash: a block, transaction, ProTx or transition',
  hex40: 'a 40-character hash: a public-key hash',
  'base58-id': 'an ID: an identity, contract, token or document',
  'core-address': 'a Core address',
  'platform-address': 'a Platform address',
  ip: 'an IP address: a masternode’s service address',
  date: 'a date: the Core blocks of that UTC day',
  dpns: 'a name',
  text: 'text: a contract or token name',
}

export function describeInput(c: Classified): string[] {
  return c.classes.map((k) => NAMES[k])
}
