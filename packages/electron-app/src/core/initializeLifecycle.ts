import { WindowService } from '@services/WindowService'
import { app } from 'electron'

export default function initializeLifecycle() {
  app.on('activate', () => {
    if (WindowService.getMainWindow() === null) {
      WindowService.createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('second-instance', () => {
    const mainWindow = WindowService.getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized())
        mainWindow.restore()
      mainWindow.focus()
    }
  })

  process.on('uncaughtException', (error) => {
    logger.error('Unhandled Main Process Exception:', error)

    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Main Process Rejection:', reason)

    process.exit(1)
  })
}
