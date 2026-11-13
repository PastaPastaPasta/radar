import { useLingui } from '@lingui/react/macro'
import { Card, JsonView, Skeleton } from '@/ui'
import type { Decoded } from './use-decoded'

/** The outcome of a local decode: the JSON the SDK read, or what it said was wrong with the bytes. */
export function DecodedResult({ state }: { state: Decoded }) {
  const { t } = useLingui()
  if (state.status === 'idle') return null
  return (
    <Card
      title={t`Decoded`}
      layer="platform"
      state={state.status === 'pending' ? 'loading' : 'ready'}
      id="decoded"
    >
      {state.status === 'pending' ? <Skeleton shape="row" count={3} /> : null}
      {state.status === 'error' ? (
        <div role="alert" data-decode-error className="grid gap-1">
          <p className="font-semibold">{t`These bytes could not be decoded.`}</p>
          <p className="rx-mono break-words text-sm">{state.message}</p>
        </div>
      ) : null}
      {state.status === 'ok' ? (
        <JsonView value={state.data} collapsedDepth={2} label={t`Decoded JSON`} maxHeight={640} />
      ) : null}
    </Card>
  )
}
