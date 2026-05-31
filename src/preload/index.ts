import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface StampMeta {
  id: string
  name: string
  fileName: string
  createdAt: number
  dataUrl: string
}

interface LicenseInfo {
  email: string
  key: string
  activatedAt: number
  expiresAt: number | null
  isTrialMode: boolean
}

const laipdf = {
  file: {
    savePdf: (
      bytes: Uint8Array,
      suggestedName: string
    ): Promise<{ saved: boolean; path?: string }> =>
      ipcRenderer.invoke('file:save-pdf', bytes, suggestedName),
    openPdf: (): Promise<{ canceled: boolean; path?: string; bytes?: Uint8Array }> =>
      ipcRenderer.invoke('file:open-pdf'),
    openPdfs: (): Promise<{
      canceled: boolean
      files?: Array<{ path: string; name: string; bytes: Uint8Array }>
    }> => ipcRenderer.invoke('file:open-pdfs')
  },
  fonts: {
    getJp: (): Promise<Uint8Array | null> => ipcRenderer.invoke('fonts:get-jp')
  },
  license: {
    status: (): Promise<{ activated: boolean; license: LicenseInfo | null }> =>
      ipcRenderer.invoke('license:status'),
    verify: (
      email: string,
      key: string
    ): Promise<{ ok: boolean; message: string; license?: LicenseInfo }> =>
      ipcRenderer.invoke('license:verify', email, key),
    startTrial: (): Promise<{ ok: boolean; license: LicenseInfo }> =>
      ipcRenderer.invoke('license:start-trial'),
    deactivate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('license:deactivate')
  },
  stamps: {
    list: (): Promise<StampMeta[]> => ipcRenderer.invoke('stamps:list'),
    pickImage: (): Promise<{ canceled: boolean; bytes?: Uint8Array; name?: string }> =>
      ipcRenderer.invoke('stamps:pick-image'),
    add: (bytes: Uint8Array, name: string): Promise<StampMeta> =>
      ipcRenderer.invoke('stamps:add', bytes, name),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('stamps:delete', id)
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
export type { StampMeta, LicenseInfo }
