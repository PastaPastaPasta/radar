import { useLingui } from '@lingui/react/macro'

/** Said once DAPI's answer has replaced an indexed one that disagreed with it (§4.7, indexed first). */
export function IndexDiffered() {
  const { t } = useLingui()
  return (
    <span className="rx-dim" data-index-differed role="status">
      {t`The index differed; DAPI's answer is shown`}
    </span>
  )
}
