import { join } from 'node:path'
import { app } from 'electron'

const isPackaged = app.isPackaged

const USER_DATA_PATH = app.getPath('userData')

const RESOURCES_PATH = isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(__dirname, '../../../resources')

export const Paths = Object.freeze({
  userData: USER_DATA_PATH,

  gamesDb: join(USER_DATA_PATH, 'games.db'),

  logs: join(USER_DATA_PATH, 'logs'),

  settings: join(USER_DATA_PATH, 'settings.json'),

  retroarch: join(USER_DATA_PATH, 'retroarch', 'retroarch.exe'),

  config: join(USER_DATA_PATH, 'lockdown.cfg'),

  resources: RESOURCES_PATH,

  appIcon: join(RESOURCES_PATH, 'icon.png'),
})
