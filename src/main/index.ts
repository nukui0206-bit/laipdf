import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile, readdir, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import Store from 'electron-store'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

interface LicenseInfo {
  email: string
  key: string
  activatedAt: number
  expiresAt: number | null
  isTrialMode: boolean
}

const licenseStore = new Store<{ license?: LicenseInfo }>({
  name: 'license',
  defaults: {}
})

const STAMPS_DIR = join(app.getPath('userData'), 'stamps')
const FONTS_DIR = join(app.getPath('userData'), 'fonts')
// フル版 OTF (約 16MB、日本語全文字含む)
const JP_FONT_FILE = join(FONTS_DIR, 'NotoSansCJKjp-Regular.otf')
const JP_FONT_URL =
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf'

async function ensureFontsDir(): Promise<void> {
  if (!existsSync(FONTS_DIR)) {
    await mkdir(FONTS_DIR, { recursive: true })
  }
}

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

  // ===== License IPC =====
  ipcMain.handle(
    'license:status',
    (): { activated: boolean; license: LicenseInfo | null } => {
      const lic = licenseStore.get('license') ?? null
      if (!lic) return { activated: false, license: null }
      // 有効期限チェック
      if (lic.expiresAt && Date.now() > lic.expiresAt) {
        return { activated: false, license: lic }
      }
      return { activated: true, license: lic }
    }
  )

  ipcMain.handle(
    'license:verify',
    async (
      _event,
      email: string,
      key: string
    ): Promise<{ ok: boolean; message: string; license?: LicenseInfo }> => {
      // モック実装: 後で hub.salestree.online API に差し替え
      // 有効パターン:
      //   - メアドに @laiweb.jp / @laide / @salestree が含まれる
      //   - キーが "LAIPDF-" で始まる任意の文字列
      //   - またはマスター: "MASTER-DEBUG-KEY"
      const e = email.trim().toLowerCase()
      const k = key.trim().toUpperCase()
      const validEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) &&
        (e.includes('@laiweb') || e.includes('@laide') || e.includes('@salestree') ||
          k === 'MASTER-DEBUG-KEY' || k.startsWith('LAIPDF-'))
      if (!validEmail) {
        return {
          ok: false,
          message: 'メアドまたはライセンスキーが無効です。Laiweb 契約者向けキーをご確認ください。'
        }
      }
      const lic: LicenseInfo = {
        email: e,
        key: k,
        activatedAt: Date.now(),
        expiresAt: null, // 永久
        isTrialMode: false
      }
      licenseStore.set('license', lic)
      return { ok: true, message: '認証成功', license: lic }
    }
  )

  ipcMain.handle('license:start-trial', (): { ok: boolean; license: LicenseInfo } => {
    const lic: LicenseInfo = {
      email: '',
      key: 'TRIAL',
      activatedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 日後
      isTrialMode: true
    }
    licenseStore.set('license', lic)
    return { ok: true, license: lic }
  })

  ipcMain.handle('license:deactivate', (): { ok: boolean } => {
    licenseStore.delete('license')
    return { ok: true }
  })

  // ===== Fonts IPC =====
  ipcMain.handle('fonts:get-jp', async (): Promise<Uint8Array | null> => {
    try {
      await ensureFontsDir()
      if (existsSync(JP_FONT_FILE)) {
        const buf = await readFile(JP_FONT_FILE)
        return new Uint8Array(buf)
      }
      // 初回: CDN からダウンロード
      const res = await fetch(JP_FONT_URL)
      if (!res.ok) {
        console.error('[fonts:get-jp] HTTP', res.status)
        return null
      }
      const arrayBuf = await res.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      await writeFile(JP_FONT_FILE, buf)
      console.log('[fonts:get-jp] downloaded', buf.byteLength, 'bytes')
      return new Uint8Array(buf)
    } catch (err) {
      console.error('[fonts:get-jp] error', err)
      return null
    }
  })

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
      const buffer = await readFile(result.filePaths[0])
      return {
        canceled: false,
        path: result.filePaths[0],
        bytes: new Uint8Array(buffer)
      }
    }
  )

  // ===== 印刷 =====
  // 注釈焼き込み済みの PDF bytes を受け取り、非表示の BrowserWindow で開いて印刷ダイアログ表示
  ipcMain.handle('file:print-pdf', async (_event, bytes: Uint8Array): Promise<{ ok: boolean }> => {
    try {
      const { tmpdir } = await import('os')
      const tmpPath = join(tmpdir(), `laipdf_print_${Date.now()}.pdf`)
      await writeFile(tmpPath, Buffer.from(bytes))

      const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
          plugins: true, // PDF Viewer Plugin を有効化
          sandbox: false,
        },
      })
      await printWin.loadURL(`file:///${tmpPath.replace(/\\/g, '/')}`)
      // PDF レンダリング待ち
      await new Promise((r) => setTimeout(r, 800))
      return await new Promise<{ ok: boolean }>((resolve) => {
        printWin.webContents.print(
          { silent: false, printBackground: true, deviceName: '' },
          (success, failureReason) => {
            if (!success && failureReason && failureReason !== 'cancelled') {
              console.error('[print] failure:', failureReason)
            }
            printWin.close()
            resolve({ ok: success })
          },
        )
      })
    } catch (err) {
      console.error('[print] error', err)
      return { ok: false }
    }
  })

  ipcMain.handle(
    'file:pick-images',
    async (): Promise<{
      canceled: boolean
      files?: Array<{ name: string; type: 'png' | 'jpg'; bytes: Uint8Array }>
    }> => {
      const result = await dialog.showOpenDialog({
        title: '画像を選択（複数選択可、選択順に PDF 化）',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const files = await Promise.all(
        result.filePaths.map(async (p) => {
          const ext = p.toLowerCase().split('.').pop()
          const type: 'png' | 'jpg' = ext === 'png' ? 'png' : 'jpg'
          return {
            name: p.split(/[\\/]/).pop() ?? 'image',
            type,
            bytes: new Uint8Array(await readFile(p))
          }
        })
      )
      return { canceled: false, files }
    }
  )

  ipcMain.handle(
    'file:open-pdfs',
    async (): Promise<{
      canceled: boolean
      files?: Array<{ path: string; name: string; bytes: Uint8Array }>
    }> => {
      const result = await dialog.showOpenDialog({
        title: '結合する PDF を選択（複数選択可）',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const files = await Promise.all(
        result.filePaths.map(async (p) => ({
          path: p,
          name: p.split(/[\\/]/).pop() ?? 'unknown.pdf',
          bytes: new Uint8Array(await readFile(p))
        }))
      )
      return { canceled: false, files }
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
