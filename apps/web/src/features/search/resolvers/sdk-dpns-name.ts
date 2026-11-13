import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { systemContract } from '@/lib/well-known'
import type { Resolver, SearchHit } from '../types'
import { dpnsLabel, homographSafe, isNumeric, shortId } from './helpers'

const MAX_PREFIX = 5
const MIN_PREFIX = 3

function nameHit(
  label: string,
  shown: string,
  owner: string,
  stamp: SearchHit['stamp'],
  rank: number,
): SearchHit {
  const ownerId = shortId(owner)
  return {
    kind: 'name',
    id: label,
    title: `${shown}.dash`,
    subtitle: t`Name of identity ${ownerId}`,
    href: { to: '/name/$label', params: { label } },
    stamp,
    rank,
  }
}

/**
 * A DPNS name: the exact name (`dpns.getUsernameByName` takes it as typed and converts it to the stored, homograph-safe
 * form itself) and the names that begin with it (a `startsWith` on `normalizedLabel`, which only holds the converted
 * form, so the text is converted here). Both are proof-checked, and a confirmed exact name replaces the local guess.
 */
export const sdkDpnsName: Resolver = {
  id: 'sdk-dpns-name',
  accepts: ['dpns'],
  cost: 'sdk',
  what: msg`Names`,
  async resolve(c, { net, signal }) {
    if (isNumeric(c)) return []
    const label = dpnsLabel(c.normalized)
    const { sdk } = await import('@/data/sdk/client')
    const exact = sdk
      .call(net, 'dpns.getUsernameByName', { name: `${label}.dash` }, signal)
      .then((found) =>
        found.data
          ? [
              nameHit(
                dpnsLabel(found.data.username),
                found.data.username.replace(/\.dash$/i, ''),
                found.data.identityId,
                stampOf(found),
                80,
              ),
            ]
          : [],
      )
    const prefix =
      label.length < MIN_PREFIX
        ? Promise.resolve([] as SearchHit[])
        : sdk
            .call(
              net,
              'documents.query',
              {
                contractId: systemContract('dpns').id,
                type: 'domain',
                where: [
                  ['normalizedParentDomainName', '==', 'dash'],
                  ['normalizedLabel', 'startsWith', homographSafe(label)],
                ],
                orderBy: [
                  ['normalizedParentDomainName', 'asc'],
                  ['normalizedLabel', 'asc'],
                ],
                limit: MAX_PREFIX,
              },
              signal,
            )
            .then((docs) =>
              docs.data.flatMap((doc) => {
                const written = doc.data.label
                if (typeof written !== 'string') return []
                const records = doc.data.records as { identity?: unknown } | undefined
                const owner = typeof records?.identity === 'string' ? records.identity : doc.ownerId
                return [nameHit(written.toLowerCase(), written, owner, stampOf(docs), 50)]
              }),
            )
    const [a, b] = await Promise.allSettled([exact, prefix])
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason
    return [
      ...(a.status === 'fulfilled' ? a.value : []),
      ...(b.status === 'fulfilled' ? b.value : []),
    ]
  },
}
