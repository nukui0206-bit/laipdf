import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const laipdf = {
  file: {
    savePdf: (
      bytes: Uint8Array,
      suggestedName: string
    ): Promise<{ saved: boolean; path?: string }> =>
      ipcRenderer.invoke('file:save-pdf', bytes, suggestedName),
    openPdf: (): Promise<{ canceled: boolean; path?: string; bytes?: Uint8Array }> =>
      ipcRenderer.invoke('file:open-pdf')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('laipdf', laipdf)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.laipdf = laipdf
}

export type LaiPdfAPI = typeof laipdf
