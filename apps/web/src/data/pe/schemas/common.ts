import { z } from 'zod'
import type { Page } from '../../page'
import { zIsoDate } from '../../zod'

export const nullableString = z.string().nullable()

export function peList<T extends z.ZodType>(item: T) {
  return z
    .object({
      resultSet: z.array(item),
      pagination: z.object({
        page: z.number().nullish(),
        limit: z.number().nullish(),
        total: z.number().nullish(),
      }),
    })
    .transform((v): Page<z.output<T>> => ({
      items: v.resultSet,
      page: v.pagination.page ?? undefined,
      total:
        v.pagination.total === undefined || v.pagination.total === null || v.pagination.total < 0
          ? undefined
          : v.pagination.total,
    }))
}

export function peSeries<T extends z.ZodObject>(data: T) {
  return z.array(z.object({ timestamp: zIsoDate, data })).transform((rows) => {
    const typed = rows as unknown as { timestamp: number; data: z.output<T> }[]
    return typed.map((r) => ({ t: r.timestamp, ...r.data }))
  })
}

export interface PeListQuery {
  page?: number
  limit?: number
  order?: 'asc' | 'desc'
}
