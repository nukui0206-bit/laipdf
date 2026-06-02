import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile, readdir, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID, createHash } from 'crypto'
import { hostname, userInfo, platform, release } from 'os'
import axios from 'axios'
import Store from 'electron-store'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

interface LicenseInfo {
  email: string
  key: string
  activatedAt: number
  expiresAt: number | null
  isTrialMode: boolean
  lastVerifiedAt?: number  // 最後にサーバー検証した日時
  planType?: string         // monthly / yearly / lifetime / trial
  maxDevices?: number
}

const licenseStore = new Store<{ license?: LicenseInfo; deviceId?: string }>({
  name: 'license',
  defaults: {}
})

// ライセンス API 基底 URL (hub.salestree.online)
const LICENSE_API_BASE = 'https://hub.salestree.online/api/licenses'
// オフライン猶予期間 (これを超えて非接続だと再認証要求)
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000  // 7 日

/** デバイス ID を生成 (ホスト名 + ユーザー名のハッシュ、永続化) */
function getOrCreateDeviceId(): string {
  let id = licenseStore.get('deviceId') as string | undefined
  if (id) return id
  const seed = `${hostname()}::${userInfo().username}::${randomUUID()}`
  id = createHash('sha256').update(seed).digest('hex').substring(0, 32)
  licenseStore.set('deviceId', id)
  return id
}

/** サーバから返る reason を日本語メッセージに */
function reasonToMessage(reason: string): string {
  switch (reason) {
    case 'key_not_found':       return 'ライセンスキーが見つかりません'
    case 'email_mismatch':      return '登録メールアドレスと一致しません'
    case 'revoked':             return 'このライセンスは無効化されています'
    case 'suspended':           return 'このライセンスは一時停止されています'
    case 'expired':             return 'ライセンスの有効期限が切れています'
    case 'device_limit_exceeded': return '利用可能な端末数の上限に達しました。サポートにご連絡ください'
    case 'not_found':           return 'ライセンスが見つかりません'
    default:                    return '認証できませんでした (' + reason + ')'
  }
}

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
      // オフライン猶予期間チェック (体験版はチェック不要)
      if (!lic.isTrialMode && lic.lastVerifiedAt) {
        const since = Date.now() - lic.lastVerifiedAt
        if (since > OFFLINE_GRACE_MS) {
          // 猶予期間を超えたが、まだ活性扱い。次回 verify 時に再確認させる
          // ここでは活性のまま返す (Renderer 側で再認証 UI を出すかは将来の改善)
        }
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
      const e = email.trim().toLowerCase()
      const k = key.trim().toUpperCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return { ok: false, message: 'メールアドレスの形式が不正です' }
      }
      if (!k) {
        return { ok: false, message: 'ライセンスキーを入力してください' }
      }

      const deviceId = getOrCreateDeviceId()
      try {
        const res = await axios.post(
          `${LICENSE_API_BASE}/verify`,
          {
            license_key: k,
            email: e,
            device_id: deviceId,
            machine_name: hostname(),
            os: `${platform()} ${release()}`,
            app_version: app.getVersion(),
          },
          { timeout: 15000 },
        )

        if (res.data?.valid === true) {
          const lic: LicenseInfo = {
            email: res.data.email ?? e,
            key: res.data.license_key ?? k,
            activatedAt: Date.now(),
            expiresAt: res.data.expires_at ? new Date(res.data.expires_at).getTime() : null,
            isTrialMode: res.data.plan_type === 'trial',
            lastVerifiedAt: Date.now(),
            planType: res.data.plan_type,
            maxDevices: res.data.max_devices,
          }
          licenseStore.set('license', lic)
          return { ok: true, message: '認証に成功しました', license: lic }
        }

        // valid=false の場合: サーバが詳細メッセージを返す
        const reason = res.data?.reason ?? 'unknown'
        const message = res.data?.message ?? reasonToMessage(reason)
        return { ok: false, message }
      } catch (err) {
        const e = err as { code?: string; message?: string; response?: { data?: { message?: string } } }
        // ネットワーク不通
        if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND' || e.code === 'ECONNABORTED') {
          return {
            ok: false,
            message: 'サーバーに接続できませんでした。インターネット接続をご確認ください。',
          }
        }
        // バリデーションエラー (422)
        if (e.response?.data?.message) {
          return { ok: false, message: e.response.data.message }
        }
        return { ok: false, message: 'ライセンス認証に失敗しました: ' + (e.message ?? '不明なエラー') }
      }
    }
  )

  ipcMain.handle('license:start-trial', (): { ok: boolean; license: LicenseInfo } => {
    const lic: LicenseInfo = {
      email: '',
      key: 'TRIAL',
      activatedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 日後
      isTrialMode: true,
      lastVerifiedAt: Date.now(),
      planType: 'trial',
    }
    licenseStore.set('license', lic)
    return { ok: true, license: lic }
  })

  ipcMain.handle('license:deactivate', async (): Promise<{ ok: boolean }> => {
    const lic = licenseStore.get('license')
    const deviceId = licenseStore.get('deviceId') as string | undefined
    // サーバー側のアクティベーションも削除 (失敗してもローカルは消す)
    if (lic && !lic.isTrialMode && deviceId) {
      try {
        await axios.post(
          `${LICENSE_API_BASE}/deactivate`,
          { license_key: lic.key, email: lic.email, device_id: deviceId },
          { timeout: 10000 },
        )
      } catch {
        // ネットワーク不通でもローカル無効化は実行
      }
    }
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

  // プリンタ一覧取得 (アプリ内の任意の BrowserWindow から)
  ipcMain.handle(
    'print:list-printers',
    async (): Promise<Array<{ name: string; displayName: string; isDefault: boolean }>> => {
      const wins = BrowserWindow.getAllWindows()
      const win = wins[0]
      if (!win) return []
      const list = await win.webContents.getPrintersAsync()
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName ?? p.name,
        isDefault: (p as { isDefault?: boolean }).isDefault ?? false,
      }))
    },
  )

  interface PrintOptions {
    deviceName: string
    copies: number
    pageRanges?: Array<{ from: number; to: number }>
    color: boolean
    landscape: boolean | 'auto'
    scaleFactor: number
    duplex: 'simplex' | 'shortEdge' | 'longEdge'
    pagesPerSheet?: 1 | 2 | 4 | 6 | 9 | 16
    silent: boolean
  }

  ipcMain.handle(
    'file:print-html',
    async (_event, html: string, opts: PrintOptions): Promise<{ ok: boolean; message?: string }> => {
      try {
        const { tmpdir } = await import('os')
        const tmpPath = join(tmpdir(), `laipdf_print_${Date.now()}.html`)
        await writeFile(tmpPath, Buffer.from(html, 'utf-8'))

        const printWin = new BrowserWindow({
          show: false,
          webPreferences: { sandbox: false },
        })
        await printWin.loadURL(`file:///${tmpPath.replace(/\\/g, '/')}`)
        // HTML レンダリング完了待ち
        await new Promise((r) => setTimeout(r, 300))

        // Electron Print options に変換
        const electronOpts: Electron.WebContentsPrintOptions = {
          silent: opts.silent,
          printBackground: true,
          deviceName: opts.deviceName || undefined,
          color: opts.color,
          copies: Math.max(1, opts.copies),
          landscape: opts.landscape === 'auto' ? undefined : opts.landscape,
          scaleFactor: opts.scaleFactor,
          duplexMode: opts.duplex,
        }
        if (opts.pageRanges && opts.pageRanges.length > 0) {
          electronOpts.pageRanges = opts.pageRanges
        }
        if (opts.pagesPerSheet && opts.pagesPerSheet > 1) {
          electronOpts.pagesPerSheet = opts.pagesPerSheet
        }

        return await new Promise<{ ok: boolean; message?: string }>((resolve) => {
          printWin.webContents.print(electronOpts, (success, failureReason) => {
            if (!success && failureReason && failureReason !== 'cancelled') {
              console.error('[print] failure:', failureReason)
            }
            printWin.close()
            resolve({ ok: success, message: failureReason })
          })
        })
      } catch (err) {
        console.error('[print] error', err)
        return { ok: false, message: (err as Error).message }
      }
    },
  )

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
