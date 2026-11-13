import type { DataClass } from '@/lib/data-class'

/** SDK methods only this package calls: add entries here, never in a shared file. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the owning package fills it in
export interface ToolsMethods {}

export const TOOLS_CLASSES = {} as const satisfies Record<keyof ToolsMethods, DataClass>
