import { zUnixSeconds } from '../../zod'

export const seconds = zUnixSeconds

export const secondsOrNull = zUnixSeconds.nullable()
