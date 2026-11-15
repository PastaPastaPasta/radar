import { useSyncExternalStore } from 'react'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import { Entity, type EntityProps } from '../Entity'
import { useNetwork } from '../network'
import { useIdentityName } from './use-identity-name'

export interface IdentityRefProps {
  id: string
  /** What to show instead of the identifier; without one the DPNS name is used when it is known. */
  label?: EntityProps['label']
  size?: EntityProps['size']
}

/** A link to an identity, drawn with its identicon and, when known, its name. */
export function IdentityRef({ id, label, size }: IdentityRefProps) {
  const net = useNetwork()
  const name = useIdentityName(id)
  useSyncExternalStore(subscribeLabels, labelsVersion, labelsVersion)
  return (
    <Entity
      kind="identity"
      id={id}
      label={label ?? wellKnownLabel(net, 'identity', id) ?? name}
      size={size}
      identicon
    />
  )
}
