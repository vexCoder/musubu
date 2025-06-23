import { resolve } from 'node:path'
import { BrowserWindow } from 'electron'

export default function createOverlayWindow() {
  const win = new BrowserWindow({
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

  win.setMenu(null)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env.OVERLAY_URL!)
  }

  return win
}
