import type { UdpResponse } from '@lib/UdpClient'
import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { EventEmitter } from 'node:stream'
import { Paths } from '@lib/paths'
import { UdpClient } from '@lib/UdpClient'
import { GameSessionService } from '@services/GameSessionService'
import { WindowService } from '@services/WindowService'

export enum RetroArchCommand {
  VERSION = 'VERSION',
  GET_STATUS = 'GET_STATUS',
  SAVE_STATE = 'SAVE_STATE',
  LOAD_STATE = 'LOAD_STATE',
}

export interface GameStateResponse {
  command: RetroArchCommand.GET_STATUS
  state: string
  consoleId: string
  rom: string
}

export interface GameSaveStateResponse {
  command: RetroArchCommand.SAVE_STATE
}

type GameCommandResponse = GameStateResponse | GameSaveStateResponse

interface EventMap {
  destroyed: []
}

export class GameSessionManager extends EventEmitter<EventMap> {
  private overlayWindow: BrowserWindow | null = null
  private service: GameSessionService
  private udp: UdpClient = new UdpClient()
  private corePath: string
  private discPaths: string[]

  constructor(corePath: string, discPaths: string[]) {
    super()

    if (!corePath || !discPaths || discPaths.length === 0) {
      throw new Error('Core path and disc paths are required to start a game session.')
    }

    this.corePath = corePath
    this.discPaths = discPaths

    this.overlayWindow = WindowService.createOverlayWindow()

    this.service = new GameSessionService({
      paths: {
        retroarch: process.env.NODE_ENV === 'development'
          ? 'J:\\Projects\\ts\\musubu\\.test\\RetroArch\\RetroArch-Win64\\retroarch.exe'
          : Paths.retroarch,
        config: Paths.config,
        core: this.corePath,
        game: this.discPaths[0], // Use the first disc path for now
      },
      overlayWindow: this.overlayWindow,
      preloadScript: join(__dirname, 'bridge.js'),
    })

    this.setupListeners()
  }

  public async start() {
    try {
      logger.info('🚀 Starting new game session...')

      if (this.service) {
        logger.warn('⚠️ A game session is already running. Stopping the previous session...')
        await this.service.cleanup()
      }

      await this.service.run()

      return this.service
    }
    catch (error) {
      logger.error('❌ Error during game session:', error)
      throw new Error(`Game session failed: ${(error as Error).message}`)
    }
  }

  public async stop() {
    if (!this.service) {
      throw new Error('No active game session to stop.')
    }

    this.service.removeAllListeners()

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close()
      this.overlayWindow = null
    }

    await this.service.cleanup()

    this.emit('destroyed')
  }

  public async state(): Promise<GameCommandResponse> {
    try {
      const response = await this.udp.send.expectResponse(RetroArchCommand.GET_STATUS)
      if (!response) {
        throw new Error('No response received from RetroArch.')
      }

      const parsedResponse = this._parseUdpResponse(RetroArchCommand.GET_STATUS, response)

      if (!parsedResponse) {
        throw new Error('Failed to parse RetroArch status response.')
      }

      return parsedResponse
    }
    catch (error) {
      logger.error('Failed to get RetroArch status:', error)
      throw new Error(`Failed to get RetroArch status: ${(error as Error).message}`)
    }
  }

  public async save(): Promise<void> {
    try {
      await this.udp.send(RetroArchCommand.SAVE_STATE)
    }
    catch (error) {
      logger.error('Failed to get RetroArch version:', error)
      throw new Error(`Failed to get RetroArch version: ${(error as Error).message}`)
    }
  }

  public async load(): Promise<void> {
    try {
      await this.udp.send(RetroArchCommand.LOAD_STATE)
    }
    catch (error) {
      logger.error('Failed to get RetroArch version:', error)
      throw new Error(`Failed to get RetroArch version: ${(error as Error).message}`)
    }
  }

  private _parseUdpResponse<T extends RetroArchCommand>(command: T, response: UdpResponse): GameCommandResponse | undefined {
    switch (command) {
      case 'GET_STATUS': {
        const [msgCommand, state, ...rest] = response.data.toString().split(' ')
        const [consoleId, rom] = rest.join(' ').split(',')
        return {
          // eslint-disable-next-line ts/no-explicit-any
          command: msgCommand as any,
          state,
          consoleId,
          rom,
        }
      }
    }
  }

  private setupListeners() {
    this.service.on('session-started', () => {
      logger.info('🎮 Game session started successfully.')
    })

    this.service.on('session-stopped', () => {
      this.stop()
    })

    this.service.on('session-error', (error) => {
      logger.error('❌ Game session error:', error)
      this.stop()
    })
  }
}
