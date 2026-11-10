import type { Classified, InputClass, SecretWarning } from './classify'

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

const SECRET_NOTICES: Record<SecretWarning, { title: string; body: string }> = {
  secret: {
    title: 'That looks like a private key or recovery phrase',
    body: 'Radar never needs one, so it isn’t sent anywhere, and it’s kept out of the address bar and your history.',
  },
  'possible-secret': {
    title: 'That could be part of a recovery phrase',
    body: 'Radar never needs a recovery phrase, so words like these aren’t sent anywhere, and they’re kept out of the address bar and your history. Search for a name, an ID or a number instead.',
  },
}

export function secretNotice(warning: SecretWarning): { title: string; body: string } {
  return SECRET_NOTICES[warning]
}
