import { useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isSourceError } from '@/data/errors'
import { radarQueries } from '@/data/radar/queries'
import { announce } from '@/ui'
import type { NetworkId } from '@/lib/network'
import { Badge, Time } from '@/ui'

/**
 * A live handshake with the node, from Radar's edge. Radar allows 5 a minute per client and per node and reuses a
 * result for 60 s, so the answer may be a cached one or a request to wait.
 */
export function CheckNow({ net, protx }: { net: NetworkId; protx: string }) {
  const { t } = useLingui()
  const client = useQueryClient()
  const check = useMutation({
    mutationFn: () => client.fetchQuery(radarQueries.check(net, protx)),
    onSuccess: (r) => {
      announce(r.data.ok ? t`The node answered.` : t`The node did not answer.`)
    },
  })
  const r = check.data?.data
  const error = check.error
  const limited = isSourceError(error) && error.kind === 'rate-limited'
  const wait =
    isSourceError(error) && error.retryAfterMs !== undefined
      ? Math.max(1, Math.ceil(error.retryAfterMs / 1000))
      : null
  return (
    <div className="grid gap-2" data-check-now>
      <div>
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          disabled={check.isPending}
          onClick={() => {
            check.mutate()
          }}
        >
          {check.isPending ? t`Checking…` : t`Check now`}
        </button>
      </div>
      <p role="status" aria-live="polite" className="rx-sm" data-check-result>
        {r ? (
          <>
            <Badge tone={r.ok ? 'success' : 'danger'}>
              {r.ok
                ? t`Answered in ${Math.round((r.connect_ms ?? 0) + (r.handshake_ms ?? 0))} ms`
                : t`No answer`}
            </Badge>{' '}
            {r.ok ? null : r.error ? <span>{r.error}</span> : null}
            {r.from ? <span className="rx-dim"> {t`from ${r.from}`}</span> : null}
            {r.ok && r.user_agent ? <span className="rx-dim"> · {r.user_agent}</span> : null}
            {r.ok && r.height != null ? (
              <span className="rx-dim"> · {t`height ${r.height}`}</span>
            ) : null}
            {r.cached && r.checked ? (
              <span className="rx-dim">
                {' '}
                · {t`reused from`} <Time ms={r.checked} />
              </span>
            ) : null}
          </>
        ) : limited ? (
          wait ? (
            t`Too many checks: Radar allows 5 a minute for each client and each node. Try again in ${wait} s.`
          ) : (
            t`Too many checks: Radar allows 5 a minute for each client and each node. Try again in a minute.`
          )
        ) : error ? (
          t`The check failed: ${error instanceof Error ? error.message : String(error)}`
        ) : null}
      </p>
    </div>
  )
}
