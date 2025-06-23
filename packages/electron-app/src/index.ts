import initializeIpc from '@core/initializeIpc'
import initializeLifecycle from '@core/initializeLifecycle'
import { Settings } from '@core/settings'
import { DataSyncService } from '@services/DataSync'
import { WindowManager } from '@window/WindowManager'
import { app } from 'electron'

app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  await Settings.load()

  const emitter = DataSyncService.initialize()
  emitter.run()

  initializeLifecycle()
  initializeIpc()

  WindowManager.createMainWindow()
})
