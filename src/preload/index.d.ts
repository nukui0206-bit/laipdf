import { ElectronAPI } from '@electron-toolkit/preload'
import type { LaiPdfAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    laipdf: LaiPdfAPI
  }
}
