import type { Context } from '@trpc/types'
import { initTRPC } from '@trpc/server'

export const trpc = initTRPC.context<Context>().create({ isServer: true })
