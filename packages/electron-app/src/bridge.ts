import type { IpcRendererEvent } from 'electron/renderer'
import type { SuperJSONResult } from 'superjson'
import type { TRPCResponse } from '@/trpc/types'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

process.once('loaded', async () => {
  contextBridge.exposeInMainWorld('app', {
    send: (data: SuperJSONResult): Promise<SuperJSONResult> => {
      return ipcRenderer.invoke('trpc', data)
    },
    receive: (
      callback: (event: IpcRendererEvent, message: TRPCResponse) => void,
    ) => {
      return ipcRenderer.on('trpc-message', (event, message) => callback(event, message))
    },

    // backend utilities
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file)
    },
  })
})
