import createMainWindow from '@window/createMainWindow'
import createOverlayWindow from '@window/createOverlayWindow'

export class WindowManager {
  private static mainWindow: Electron.BrowserWindow | null = null

  private static overlayWindow: Electron.BrowserWindow | null = null

  private static windows: Electron.BrowserWindow[] = []

  public static getMainWindow() {
    return WindowManager.mainWindow
  }

  public static getOverlayWindow() {
    return WindowManager.overlayWindow
  }

  public static getAllWindows() {
    return WindowManager.windows
  }

  public static createMainWindow() {
    const window = createMainWindow()
    this.mainWindow = window

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    this.windows.push(this.mainWindow)

    return this.mainWindow
  }

  public static createOverlayWindow() {
    const window = createOverlayWindow()
    this.overlayWindow = window

    this.overlayWindow.on('closed', () => {
      this.mainWindow = null
    })

    this.windows.push(this.overlayWindow)

    return this.overlayWindow
  }
}
