import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { RadarActivation, RadarActivationDeployment } from '@/data/radar/schemas'
import { formatInt } from '@/lib/format'
import { Card } from '@/ui'
import { Notice } from '../nodes/parts'
import { when } from './v24-format'

const CORE = 'https://github.com/dashpay/dash/blob/v24.0.0'

/** A note under the headline when Radar's reading and its dashd's differ. */
export function ActivationNotes({ d }: { d: RadarActivationDeployment }) {
  const { t } = useLingui()
  if (d.consistent) return null
  return (
    <Notice tone="warn" data-activation-note>
      <b>{t`Our reading disagrees with our dashd's.`}</b>{' '}
      {d.mismatches.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('; ')}
    </Notice>
  )
}

export function HowItWorks({
  doc,
  d,
  stamp,
}: {
  doc: RadarActivation
  d: RadarActivationDeployment
  stamp: SourceStamp
}) {
  const { t } = useLingui()
  const p = d.params
  const evo = doc.deployments.find((x) => x.name === 'evo_shares')
  const link = (path: string) => (
    <a href={`${CORE}/${path}`} target="_blank" rel="noreferrer">
      {path.replace('src/', '')}
    </a>
  )
  return (
    <Card title={t`How activation works`} id="how" layer="network" source={stamp}>
      <div className="grid gap-3 max-w-prose" data-v24-how>
        <p>
          {t`Core 24 is a hard fork (deployment bit ${String(p.bit)}) with two gates. First the masternodes: after ${when(p.start_time)} (by the chain's median time past), a ${doc.mnhf ?? 'masternode'} quorum signs the activation request and a miner puts the signature in a block. This is DIP-0023's enhanced hard fork signal (EHF). Until it's mined, miners' blocks don't count, however many signal.`}
        </p>
        <p>
          {t`Then the miners: the chain is cut into ${formatInt(p.window)}-block windows, starting at heights that are multiples of ${formatInt(p.window)}. The first window whose previous block is at or past both the start time and the signal's block is the first that counts. A window in which at least the threshold of blocks signal locks Core 24 in; the next window is locked in, and Core 24 is active from the one after.`}{' '}
          {p.timeout
            ? t`A window that doesn't lock in and whose last block's median time is at or past ${when(p.timeout)} fails it.`
            : t`There's no timeout on this network.`}
        </p>
        <p>
          {t`Radar reads every block header, counts the signals with Core's rules, and checks the states against its dashd's getdeploymentinfo.`}
        </p>
        {evo ? (
          <p>
            {t`A second deployment, evo_shares (bit ${String(evo.params.bit)}), has the same window and thresholds, but Dash Core 24.0.0 doesn't sign its masternode signal, so it can't start until a later release does.`}
          </p>
        ) : null}
        <p className="text-sm text-[var(--dh-ink-2)]">
          {t`Sources, Dash Core v24.0.0:`} {link('src/chainparams.cpp')},{' '}
          {link('src/versionbits.cpp')}, {link('src/evo/mnhftx.cpp')},{' '}
          {link('src/llmq/ehf_signals.cpp')}.
        </p>
      </div>
    </Card>
  )
}
