import { resolve } from 'node:path'
import { Settings } from '@core/settings'
import waitForUrl from '@lib/waitForUrl'
import { BrowserWindow } from 'electron'

export class WindowService {
  private static mainWindow: Electron.BrowserWindow

  private static overlayWindow: Electron.BrowserWindow

  private static windows: Electron.BrowserWindow[] = []

  public static getMainWindow() {
    return WindowService.mainWindow
  }

  public static getOverlayWindow() {
    return WindowService.overlayWindow
  }

  public static getAllWindows() {
    return WindowService.windows
  }

  public static createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: resolve(__dirname, 'bridge.js'),
      },
    })

    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL(process.env.RENDERER_URL)
      this.mainWindow.webContents.toggleDevTools()
    }

    this.mainWindow.on('resize', () => {
      const [newWidth, newHeight] = this.mainWindow.getSize()
      Settings.set('window', { width: newWidth, height: newHeight })
    })

    this.mainWindow.on('ready-to-show', () => {
      const settings = Settings.get('window')
      if (settings) {
        this.mainWindow.setSize(settings.width, settings.height)
      }
    })

    this.mainWindow.webContents.on('console-message', (event) => {
      const { message, lineNumber, sourceId } = event

      logger.debug(`[Renderer] ${message} (${sourceId}:${lineNumber})`)
    })

    this.windows.push(this.mainWindow)

    return this.mainWindow
  }

  public static createOverlayWindow() {
    this.overlayWindow = new BrowserWindow({
      width: 200,
      height: 50,
      frame: false,
      transparent: true,
      hasShadow: false,
      titleBarStyle: 'hidden',
      movable: false,
      maximizable: false,
      resizable: false,
      webPreferences: {
        preload: resolve(__dirname, 'bridge.js'),
      },
    })

    this.overlayWindow.setMenu(null)

    if (process.env.NODE_ENV === 'development') {
      this.overlayWindow.loadURL(process.env.OVERLAY_URL!)
    }

    this.windows.push(this.overlayWindow)

    return this.overlayWindow
  }

  public static async waitForWindow(window: Electron.BrowserWindow): Promise<void> {
    if (!window) {
      throw new Error('Window is not defined')
    }

    if (window.isDestroyed()) {
      throw new Error('Window is destroyed')
    }

    await waitForUrl(process.env.RENDERER_URL)
  }
}
