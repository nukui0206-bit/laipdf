import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile, readdir, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const STAMPS_DIR = join(app.getPath('userData'), 'stamps')

async function ensureStampsDir(): Promise<void> {
  if (!existsSync(STAMPS_DIR)) {
    await mkdir(STAMPS_DIR, { recursive: true })
  }
}

interface StampMeta {
  id: string
  name: string
  fileName: string
  createdAt: number
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.laiweb.laipdf')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ===== IPC =====
  ipcMain.handle(
    'file:save-pdf',
    async (
      _event,
      bytes: Uint8Array,
      suggestedName: string
    ): Promise<{ saved: boolean; path?: string }> => {
      const result = await dialog.showSaveDialog({
        title: 'PDF を保存',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { saved: false }
      await writeFile(result.filePath, Buffer.from(bytes))
      return { saved: true, path: result.filePath }
    }
  )

  // ===== Stamps IPC =====
  ipcMain.handle(
    'stamps:list',
    async (): Promise<Array<StampMeta & { dataUrl: string }>> => {
      await ensureStampsDir()
      const files = await readdir(STAMPS_DIR)
      const metaFiles = files.filter((f) => f.endsWith('.meta.json'))
      const stamps: Array<StampMeta & { dataUrl: string }> = []
      for (const metaFile of metaFiles) {
        try {
          const meta: StampMeta = JSON.parse(
            await readFile(join(STAMPS_DIR, metaFile), 'utf-8'),
          )
          const imgPath = join(STAMPS_DIR, meta.fileName)
          if (!existsSync(imgPath)) continue
          const imgBuf = await readFile(imgPath)
          const dataUrl = `data:image/png;base64,${imgBuf.toString('base64')}`
          stamps.push({ ...meta, dataUrl })
        } catch (err) {
          console.warn('[stamps:list] skip', metaFile, err)
        }
      }
      return stamps.sort((a, b) => b.createdAt - a.createdAt)
    },
  )

  ipcMain.handle(
    'stamps:pick-image',
    async (): Promise<{ canceled: boolean; bytes?: Uint8Array; name?: string }> => {
      const result = await dialog.showOpenDialog({
        title: '印鑑画像を選択',
        properties: ['openFile'],
        filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const filePath = result.filePaths[0]
      const buffer = await readFile(filePath)
      const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '印鑑'
      return { canceled: false, bytes: new Uint8Array(buffer), name: baseName }
    },
  )

  ipcMain.handle(
    'stamps:add',
    async (
      _event,
      bytes: Uint8Array,
      name: string,
    ): Promise<StampMeta & { dataUrl: string }> => {
      await ensureStampsDir()
      const id = randomUUID()
      const fileName = `stamp_${id}.png`
      const filePath = join(STAMPS_DIR, fileName)
      await writeFile(filePath, Buffer.from(bytes))
      const meta: StampMeta = { id, name, fileName, createdAt: Date.now() }
      await writeFile(
        join(STAMPS_DIR, `${id}.meta.json`),
        JSON.stringify(meta, null, 2),
        'utf-8',
      )
      const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
      return { ...meta, dataUrl }
    },
  )

  ipcMain.handle('stamps:delete', async (_event, id: string): Promise<boolean> => {
    await ensureStampsDir()
    const metaPath = join(STAMPS_DIR, `${id}.meta.json`)
    if (!existsSync(metaPath)) return false
    const meta: StampMeta = JSON.parse(await readFile(metaPath, 'utf-8'))
    const imgPath = join(STAMPS_DIR, meta.fileName)
    if (existsSync(imgPath)) await unlink(imgPath)
    await unlink(metaPath)
    return true
  })

  ipcMain.handle(
    'file:open-pdf',
    async (): Promise<{ canceled: boolean; path?: string; bytes?: Uint8Array }> => {
      const result = await dialog.showOpenDialog({
        title: 'PDF を開く',
        properties: ['openFile'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const { readFile } = await import('fs/promises')
      const buffer = await readFile(result.filePaths[0])
      return {
        canceled: false,
        path: result.filePaths[0],
        bytes: new Uint8Array(buffer)
      }
    }
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
