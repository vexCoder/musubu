import gameRouter from '@trpc/api/game.router'
import syncRouter from '@trpc/api/sync.router'
import { trpc } from '@trpc/trpc'

export const router = trpc.router({
  game: gameRouter,
  sync: syncRouter,
})

export type AppRouter = typeof router
