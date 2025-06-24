import initializeIpc from '@core/initializeIpc'
import initializeLifecycle from '@core/initializeLifecycle'
import { Settings } from '@core/settings'
import { DataSyncService } from '@services/DataSyncService'
import { WindowManager } from '@window/WindowManager'
import { app } from 'electron'
import { initializeDatabase } from '@/core/db'

app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  await Settings.load()

  const emitter = DataSyncService.initialize()
  emitter.run()

  initializeDatabase()
  initializeLifecycle()
  initializeIpc()

  WindowManager.createMainWindow()
})
