import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { Classified, InputClass, SecretWarning } from './classify'

const NAMES = {
  int: msg`a number: could be a Core height, a Platform height or an epoch`,
  hex64: msg`a 64-character hash: could be a Core block, a transaction, a Platform block, a state transition or an identity`,
  hex40: msg`a 40-character hash: a public-key hash`,
  'base58-id': msg`an ID: could be an identity, a contract or a token`,
  'document-path': msg`a document path: a contract, a document type and a document ID`,
  'core-address': msg`a Core address`,
  'platform-address': msg`a Platform address`,
  ip: msg`an IP address: a masternode’s service address`,
  date: msg`a date: the Core blocks of that UTC day`,
  dpns: msg`a name`,
  text: msg`text: could be a name, a contract or a token`,
} satisfies Record<InputClass, ReturnType<typeof msg>>

export function describeInput(c: Classified): string[] {
  return c.classes.map((k) => i18n._(NAMES[k]))
}

const SECRET_NOTICES = {
  secret: {
    title: msg`That looks like a private key or recovery phrase`,
    body: msg`Radar never needs one, so it isn’t sent anywhere, and it’s kept out of the address bar and your history.`,
  },
  'possible-secret': {
    title: msg`That could be part of a recovery phrase`,
    body: msg`Radar never needs a recovery phrase, so words like these aren’t sent anywhere, and they’re kept out of the address bar and your history. Search for a name, an ID or a number instead.`,
  },
} satisfies Record<SecretWarning, { title: ReturnType<typeof msg>; body: ReturnType<typeof msg> }>

export function secretNotice(warning: SecretWarning): { title: string; body: string } {
  const notice = SECRET_NOTICES[warning]
  return { title: i18n._(notice.title), body: i18n._(notice.body) }
}
