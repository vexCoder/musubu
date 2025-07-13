import { TRPCError } from '@trpc/server'
import { trpc } from '@trpc/trpc'
import { GameSessionManager } from '@/manager/GameSessionManager'

let activeSession: GameSessionManager | null = null

const gameRouter = trpc.router({
  run: trpc.procedure
    .mutation(async () => {
      if (activeSession) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A game session is already running.',
        })
      }

      const session = new GameSessionManager(
        'J:\\Projects\\ts\\musubu\\.test\\RetroArch\\RetroArch-Win64\\cores\\swanstation_libretro.dll',
        ['J:\\Games\\Roms\\ps1\\Final Fantasy Tactics (USA).bin'],
      )

      session.on('destroyed', () => {
        activeSession = null // Clear the active session when destroyed
        logger.info('Game session has been destroyed and cleared from active sessions.')
      })

      activeSession = session

      try {
        await session.start()

        return { ok: true }
      }
      catch (error) {
        activeSession = null // Ensure session is cleared on failure
        logger.error('tRPC router caught an error from the game service:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: (error as Error).message || 'An unknown error occurred while running the game.',
          cause: error,
        })
      }
    }),
  stop: trpc.procedure.mutation(async () => {
    if (!activeSession) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active game session to stop.',
      })
    }

    await activeSession.stop()
    activeSession = null
    return { ok: true, message: 'Game session stopped.' }
  }),
  state: trpc.procedure.query(async () => {
    if (!activeSession) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active game session to query state.',
      })
    }

    try {
      const state = await activeSession.state()
      return { ok: true, state }
    }
    catch (error) {
      logger.error('tRPC router caught an error while querying game state:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: (error as Error).message || 'An unknown error occurred while querying game state.',
        cause: error,
      })
    }
  }),
  save: trpc.procedure
    .mutation(async () => {
      if (!activeSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active game session to save state.',
        })
      }

      try {
        await activeSession.save()
        return { ok: true, message: 'Game state saved successfully.' }
      }
      catch (error) {
        logger.error('tRPC router caught an error while saving game state:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: (error as Error).message || 'An unknown error occurred while saving game state.',
          cause: error,
        })
      }
    }),
  load: trpc.procedure
    .mutation(async () => {
      if (!activeSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active game session to load state.',
        })
      }

      try {
        await activeSession.load()
        return { ok: true, message: 'Game state loaded successfully.' }
      }
      catch (error) {
        logger.error('tRPC router caught an error while loading game state:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: (error as Error).message || 'An unknown error occurred while loading game state.',
          cause: error,
        })
      }
    }),
})

export default gameRouter
