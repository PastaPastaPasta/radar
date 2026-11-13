import { Entity, type EntityProps } from '../Entity'
import { useIdentityName } from './use-identity-name'

export interface IdentityRefProps {
  id: string
  /** What to show instead of the identifier; without one the DPNS name is used when it is known. */
  label?: EntityProps['label']
  size?: EntityProps['size']
}

/** A link to an identity, drawn with its identicon and, when known, its name. */
export function IdentityRef({ id, label, size }: IdentityRefProps) {
  const name = useIdentityName(id)
  return <Entity kind="identity" id={id} label={label ?? name} size={size} identicon />
}
