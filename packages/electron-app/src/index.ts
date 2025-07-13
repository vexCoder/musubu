/* eslint-disable import/first */
if (process.argv.includes('--enable-source-maps')) {
  // eslint-disable-next-line ts/no-require-imports
  require('source-map-support').install({
    environment: 'node',
    handleUncaughtExceptions: true,
  })
}

import { initializeDatabase } from '@core/gamesDb'
import initializeIpc from '@core/initializeIpc'
import initializeLifecycle from '@core/initializeLifecycle'
import { Settings } from '@core/settings'
import { DataSyncService } from '@services/data-sync/DataSyncService'
import { WindowService } from '@services/WindowService'
import { app } from 'electron'
import '@core/augment'

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

  const mainWindow = WindowService.createMainWindow()
  await WindowService.waitForWindow(mainWindow)

  dataSync.run()
})
