// @/modules/game/game.service.ts

import type { ActiveWindow } from '@musubu/tracker'
import type { BrowserWindow, Rectangle } from 'electron'
import type { ResultPromise } from 'execa'
import readline from 'node:readline'
import { EventEmitter } from 'node:stream'
import { getActiveWindows, setWindowOwner, startTracking, stopTracking } from '@musubu/tracker'

import { execa } from 'execa'
import _ from 'lodash'
import treeKill from 'tree-kill'

interface GameConfigPaths {
  retroarch: string
  config: string
  core: string
  game: string
}

interface GameSessionConfig {
  paths: GameConfigPaths
  overlayWindow: BrowserWindow
  startUpTimeout?: number
  overlayProcessThrottle?: number
  preloadScript?: string
}

interface EventMap {
  'session-started': []
  'session-stopped': []
  'session-error': [Error]
}

export class GameSessionService extends EventEmitter<EventMap> {
  private retroarchProcess?: ResultPromise
  private retroarchInstance?: ActiveWindow

  constructor(private readonly sessionConfig: GameSessionConfig) {
    super()
    if (!sessionConfig || !sessionConfig.paths) {
      throw new Error('GameSession requires a valid gameConfig with paths.')
    }

    if (sessionConfig.overlayWindow?.isDestroyed()) {
      throw new Error('Overlay window must be provided and not destroyed.')
    }
  }

  public async run(): Promise<void> {
    try {
      console.log('🚀 Starting new game session...')

      this.retroarchProcess = this._launchRetroArch()

      if (!this.retroarchProcess?.pid) {
        throw new Error('Failed to get RetroArch process ID.')
      }

      await this._waitForRetroArchReady(this.retroarchProcess)

      if (!this.retroarchInstance) {
        throw new Error('RetroArch instance not found after startup.')
      }

      this._trackWindowAndPositionOverlay()
      this.emit('session-started')
    }
    catch (error) {
      console.error('❌ Error during game session:', error)
      // Re-throw the error so the tRPC layer can handle it.
      this.emit('session-error', error as Error)
    }
  }

  public async cleanup(): Promise<void> {
    stopTracking()

    const pid = this.retroarchInstance?.pid

    if (pid) {
      await new Promise<void>(resolve => treeKill(pid, () => resolve()))
    }

    this.retroarchProcess = undefined
    this.retroarchInstance = undefined
  }

  /**
   * Spawns the RetroArch process using execa.
   */
  private _launchRetroArch(): ResultPromise {
    const { paths } = this.sessionConfig
    const args = [
      '--verbose',
      `--appendconfig=${paths.config}`,
      '-L',
      paths.core,
      paths.game,
    ]

    console.log(`Spawning RetroArch with command: ${paths.retroarch} ${args.join(' ')}`)

    return execa(paths.retroarch, args, { reject: false })
  }

  /**
   * Listens to RetroArch's stderr to confirm a successful launch.
   */
  private _waitForRetroArchReady(process: ResultPromise): Promise<void> {
    return new Promise((resolve, reject) => {
      const { startUpTimeout = 8000 } = this.sessionConfig
      const foundIdentifiers = new Set<string>()

      const timer = setTimeout(() => {
        reject(new Error(`RetroArch startup timed out after ${startUpTimeout}ms.`))
      }, startUpTimeout)

      const rl = readline.createInterface({ input: process.stderr! })

      const identifiers = new Set([
        'RetroArch',
        'Found display server:',
        'Set video size to:',
        'Device created',
        'Started synchronous audio driver',
      ])

      rl.on('line', (line) => {
        for (const id of identifiers) {
          if (line.includes(id) && !foundIdentifiers.has(id)) {
            console.log(`✅ Startup log found: "${id}"`)
            foundIdentifiers.add(id)
          }
        }

        // When all required logs are found, we're ready.
        if (foundIdentifiers.size === identifiers.size) {
          const windows = getActiveWindows()
          const retroarchWindows = windows.find(w => w.title.includes('RetroArch'))

          if (!retroarchWindows) {
            reject(new Error('RetroArch window not found after startup.'))
            return
          }

          this.retroarchInstance = retroarchWindows
          clearTimeout(timer)
          rl.close()
          console.log('🎮 RetroArch is ready!')
          resolve()
        }
      })
    })
  }

  public _trackWindowAndPositionOverlay(): Promise<void> {
    const { overlayProcessThrottle = 16 } = this.sessionConfig
    return new Promise<void>((resolve) => {
      // Throttle the setBounds call to avoid overwhelming the renderer process.
      const overlay = this.sessionConfig.overlayWindow
      const overlayHandle = overlay.getNativeWindowHandle().readUInt32LE(0)
      const retroarchHandle = this.retroarchInstance?.handle

      if (!retroarchHandle) {
        throw new Error('RetroArch handle is not available.')
      }

      overlay.setAlwaysOnTop(true)
      overlay.setAlwaysOnTop(false)

      setWindowOwner(overlayHandle, retroarchHandle)

      const throttledSetPosition = _.throttle((rect: Rectangle) => {
        if (overlay.isDestroyed())
          return

        if (rect.x < 0 && rect.y < 0) {
          overlay.hide()
          return
        }

        if (!overlay.isVisible()) {
          overlay.show()
        }

        overlay.setBounds({
          x: Math.round(rect.x + rect.width * 0.05),
          y: Math.round(rect.y + rect.height * 0.05),
          width: Math.round(rect.width * 0.9),
          height: Math.round(rect.height * 0.9),
        })
      }, overlayProcessThrottle)

      const onStop = () => {
        console.log('Target window closed. Stopping tracking.')
        if (overlay && !overlay.isDestroyed()) {
          setWindowOwner(overlayHandle, 0)
        }

        this.emit('session-stopped')

        resolve()
      }

      overlay.on('closed', () => {
        console.log('Overlay window closed by user.')

        this.emit('session-stopped')
        resolve()
      })

      startTracking(retroarchHandle, (data) => {
        if (data.type === 'close') {
          onStop()
        }

        if (data.type === 'move') {
          throttledSetPosition(data.payload)
        }
      })
    })
  }
}
