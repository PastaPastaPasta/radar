import { useLingui } from '@lingui/react/macro'

/** What a CoinJoin mix is, and why it pays no fee, under the figures of one. */
export function CoinJoinNote() {
  const { t } = useLingui()
  return (
    <div className="rx-note mt-4 grid max-w-[72ch] gap-2" role="note" data-coinjoin-note>
      <p className="m-0">
        <strong>{t`A CoinJoin mix.`}</strong>{' '}
        {t`Several wallets each put in coins of one standard size (10.0001, 1.00001, 0.100001, 0.0100001 or 0.00100001 DASH: a round amount plus a hundred-thousandth of it) and take the same amounts back at new addresses, which makes each output hard to link to the input it came from. A masternode coordinates the round.`}
      </p>
      <p className="m-0">
        {t`Dash Core relays a mix without a fee, so its inputs add up to exactly its outputs. Radar calls a transaction CoinJoin by that shape, the way Dash Core checks one: as many inputs as outputs, and every output a standard denomination paid to a plain address.`}
      </p>
    </div>
  )
}
