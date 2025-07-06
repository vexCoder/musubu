import { WindowManager } from '@window/WindowManager'
import { app } from 'electron'

export default function initializeLifecycle() {
  app.on('activate', () => {
    if (WindowManager.getMainWindow() === null) {
      WindowManager.createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('second-instance', () => {
    const mainWindow = WindowManager.getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized())
        mainWindow.restore()
      mainWindow.focus()
    }
  })
}
