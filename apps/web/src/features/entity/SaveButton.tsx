import { useLingui } from '@lingui/react/macro'
import { announce, Icon } from '@/ui'
import { useNetwork } from './network'
import { removeItem, saveItem, useIsSaved, type SavedItem } from './saved'

export interface SaveButtonProps {
  kind: SavedItem['kind']
  id: string
  /** A name for the saved list, e.g. the DPNS name or the token's. */
  label?: string
}

/** Keeps the item in this browser's saved list; nothing leaves the device. */
export function SaveButton({ kind, id, label }: SaveButtonProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const on = useIsSaved({ net, kind, id })
  return (
    <button
      type="button"
      className="dh-btn dh-btn--sm"
      aria-pressed={on}
      onClick={() => {
        if (on) {
          removeItem({ net, kind, id })
          announce(t`Removed from saved`)
        } else {
          saveItem({ net, kind, id, label })
          announce(t`Saved`)
        }
      }}
    >
      <Icon name={on ? 'bookmarkOn' : 'bookmark'} size="sm" />
      {t`Save`}
    </button>
  )
}
