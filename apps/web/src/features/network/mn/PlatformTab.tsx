import { useLingui } from '@lingui/react/macro'
import { Unavailable } from '@/ui'
import { EpochCard } from './EpochCard'
import { LiveCard } from './LiveCard'
import type { MnContext } from './mn-context'
import { RewardsCard } from './RewardsCard'
import { ValidatorCard } from './ValidatorCard'

/** An evonode's Platform side: what Radar and Platform Explorer index, and what Platform itself proves. */
export function PlatformTab({ ctx, epoch }: { ctx: MnContext; epoch: number | undefined }) {
  const { t } = useLingui()
  const { d, radar } = ctx
  return (
    <div className="grid gap-5">
      {ctx.off ? (
        <Unavailable
          title={t`Reward estimates, endpoint health and Platform Explorer’s record need indexers`}
        />
      ) : null}
      {d && radar ? <RewardsCard ctx={ctx} d={d} stamp={radar} /> : null}
      <LiveCard ctx={ctx} />
      <EpochCard ctx={ctx} epoch={epoch} />
      {d && radar && !ctx.off ? <ValidatorCard ctx={ctx} d={d} /> : null}
    </div>
  )
}
