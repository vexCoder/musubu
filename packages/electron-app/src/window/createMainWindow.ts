import { resolve } from 'node:path'
import { Settings } from '@core/settings'
import { BrowserWindow } from 'electron'

export default function createMainWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: resolve(__dirname, 'bridge.js'),
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env.RENDERER_URL)
    win.webContents.toggleDevTools()
  }

  win.on('resize', () => {
    const [newWidth, newHeight] = win.getSize()
    Settings.set('window', { width: newWidth, height: newHeight })
  })

  win.on('ready-to-show', () => {
    const settings = Settings.get('window')
    if (settings) {
      win.setSize(settings.width, settings.height)
    }
  })

  return win
}
