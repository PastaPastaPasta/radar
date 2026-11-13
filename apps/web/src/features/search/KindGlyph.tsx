import { LayerGlyph } from '@/ui/art'
import { KIND_META } from '@/ui/kinds'
import type { EntityKind } from '@/ui/base'

/** The kind's icon in its layer's colour, as the entity chips draw it. */
export function KindGlyph({ kind }: { kind: EntityKind }) {
  const meta = KIND_META[kind]
  return <LayerGlyph layer={meta.layer} icon={meta.icon} />
}
