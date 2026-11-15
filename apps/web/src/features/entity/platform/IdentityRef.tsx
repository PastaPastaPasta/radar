import { Entity, type EntityProps } from '../Entity'
import { useIdentityName } from './use-identity-name'

export interface IdentityRefProps {
  id: string
  /** What to show instead of the identifier; without one the reader's own label, then the DPNS name, is used. */
  label?: EntityProps['label']
  size?: EntityProps['size']
}

/** A link to an identity, drawn with its identicon and, when known, its name. */
export function IdentityRef({ id, label, size }: IdentityRefProps) {
  const name = useIdentityName(id)
  return <Entity kind="identity" id={id} label={label} name={name} size={size} identicon />
}
