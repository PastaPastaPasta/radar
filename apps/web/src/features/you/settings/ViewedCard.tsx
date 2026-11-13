import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import {
  clearViewed,
  PageLink,
  setViewedEnabled,
  useNetwork,
  useViewedEnabled,
  useViewedIdentities,
} from '@/features/entity'
import { announce, Card } from '@/ui'

export function ViewedCard() {
  const { t } = useLingui()
  const net = useNetwork()
  const on = useViewedEnabled()
  const count = useViewedIdentities(net).length
  const remembered = plural(count, {
    one: '# identity remembered on this network',
    other: '# identities remembered on this network',
  })
  return (
    <Card
      id="viewed"
      title={t`Viewed identities`}
      subtitle={t`Off by default. When on, this browser remembers the identities you open, up to 50 per network.`}
    >
      <div className="grid gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setViewedEnabled(e.target.checked)
            }}
          />
          {t`Remember the identities I view`}
        </label>
        <p className="text-[var(--dh-ink-2)]">
          {t`They feed the seed list for token holders: no index can list every holder of a token, so a token’s Holders tab starts from the identities you have opened. The list never leaves this browser, and turning this off erases it.`}
        </p>
        <p data-viewed-count>{remembered}</p>
        <p className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="dh-btn dh-btn--sm dh-btn--destructive"
            disabled={count === 0}
            onClick={() => {
              clearViewed()
              announce(t`Viewed identities cleared`)
            }}
          >
            {t`Clear viewed identities`}
          </button>
          <PageLink to="/saved">{t`Saved items`}</PageLink>
        </p>
      </div>
    </Card>
  )
}
