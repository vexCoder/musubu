import { initializeDatabase } from '@core/gamesDb'
import initializeIpc from '@core/initializeIpc'
import initializeLifecycle from '@core/initializeLifecycle'
import { Settings } from '@core/settings'
import { DataSyncService } from '@services/DataSyncService'
import { WindowManager } from '@window/WindowManager'
import { app } from 'electron'

app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  await Settings.load()

  await initializeDatabase()
  initializeLifecycle()
  initializeIpc()

  const dataSync = DataSyncService.initialize()

  WindowManager.createMainWindow()
  await WindowManager.waitForWindow(WindowManager.getMainWindow()!)

  dataSync.run()
})
