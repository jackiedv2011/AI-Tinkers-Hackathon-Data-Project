import { app, BrowserWindow, dialog, ipcMain, shell, Tray } from 'electron'
import { join } from 'node:path'
import { getState, refreshAndRunPolicy, restoreQuarantine, stageLiveDemo, startFreshStorageScan, setWatching } from './agent'
import { isDemoPath } from './demo-paths'
import { saveProfile } from './store'
import { installTray } from './tray'
import { getAppIcon } from './app-icons'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let suppressInitialWindow = false
let pendingPage = 'Home'
let uiReady = false
const isSelfTest = process.argv.includes('--lifeguard-self-test')
const isVideoDemo = process.argv.includes('--lifeguard-video-demo')
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (isVideoDemo) app.disableHardwareAcceleration()

function createWindow(): void {
  uiReady = false
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 950,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Headroom',
    icon: join(__dirname, '../renderer/art/headroom-icon.png'),
    backgroundColor: '#f7f5f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!suppressInitialWindow) {
      if (isVideoDemo) {
        mainWindow?.maximize()
        mainWindow?.setAlwaysOnTop(true)
      }
      mainWindow?.show()
      mainWindow?.focus()
    }
    suppressInitialWindow = false
  })
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const target = new URL(details.url)
      if (target.protocol === 'https:') void shell.openExternal(target.toString())
    } catch {
      // Malformed and non-HTTPS targets stay inside the denied navigation.
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function navigate(page: string): void {
  pendingPage = page
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
  if (uiReady) mainWindow?.webContents.send('ui:navigate', page)
}

function createTray(): void {
  tray = installTray(navigate, async () => {
    const folder = await chooseFolder()
    if (folder) saveProfile({ protectedFolders: [folder] })
  }, () => { isQuitting = true; app.quit() })
}

async function chooseFolder(): Promise<string | null> {
  const response = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return response.canceled ? null : response.filePaths[0]
}

function registerIpc(): void {
  ipcMain.handle('app:icon', (_, pid) => getAppIcon(pid))
  const loginOptions = { path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }
  ipcMain.on('ui:ready', () => { uiReady = true; mainWindow?.webContents.send('ui:navigate', pendingPage) })
  ipcMain.handle('agent:set-watching', async (_, watching) => {
    if (typeof watching !== 'boolean') throw new Error('Invalid monitoring state.')
    return setWatching(watching)
  })
  ipcMain.handle('settings:get', () => ({ openAtLogin: app.getLoginItemSettings(loginOptions).openAtLogin }))
  ipcMain.handle('settings:update', (_, settings) => {
    if (typeof settings?.openAtLogin !== 'boolean') throw new Error('Invalid startup preference.')
    app.setLoginItemSettings({ ...loginOptions, openAtLogin: settings.openAtLogin })
    return { openAtLogin: app.getLoginItemSettings(loginOptions).openAtLogin }
  })
  ipcMain.handle('state:get', () => getState())
  ipcMain.handle('state:refresh', async () => {
    await refreshAndRunPolicy()
    return getState()
  })
  ipcMain.handle('profile:update', (_, partial) => {
    saveProfile(partial)
    return getState()
  })
  ipcMain.handle('folder:choose-protected', async () => {
    const folder = await chooseFolder()
    if (folder) saveProfile({ protectedFolders: [folder] })
    return getState()
  })
  ipcMain.handle('storage:scan-now', async () => {
    await startFreshStorageScan()
    await refreshAndRunPolicy()
    return getState()
  })
  ipcMain.handle('quarantine:restore', async (_, id: string) => {
    if (typeof id !== 'string' || id.length > 100 || !await restoreQuarantine(id)) throw new Error('This file could not be restored. It may already be restored or its held copy is unavailable.')
    return getState()
  })
  ipcMain.handle('demo:stage', async () => {
    await stageLiveDemo()
    setTimeout(() => void refreshAndRunPolicy().catch(() => undefined), 2500)
    return getState()
  })
}

async function startApplication(): Promise<void> {
  suppressInitialWindow = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
  if (!isSelfTest && app.isPackaged) {
    app.setLoginItemSettings(process.platform === 'win32'
      ? { openAtLogin: true, path: process.execPath, args: ['--hidden'] }
      : { openAtLogin: true })
  }
  registerIpc()
  if (!isSelfTest) {
    createWindow()
    createTray()
  }
  await refreshAndRunPolicy()
  if (isSelfTest) {
    const testStartedAt = Date.now()
    await stageLiveDemo()
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      await refreshAndRunPolicy()
      const rules = new Set(getState().actions
        .filter((entry) => new Date(entry.timestamp).getTime() >= testStartedAt)
        .map((entry) => entry.rule))
      if (rules.has('whole-drive-exact-duplicate') && rules.has('known-disposable-path') && rules.has('context-aware-memory-pressure')) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const newRecoverableItem = getState().quarantine.find((entry) => !entry.restoredAt && isDemoPath(entry.originalPath) && new Date(entry.quarantinedAt).getTime() >= testStartedAt)
    if (newRecoverableItem) await restoreQuarantine(newRecoverableItem.id)
    isQuitting = true
    app.quit()
    return
  }
  if (isVideoDemo) {
    setTimeout(() => void stageLiveDemo()
      .then(() => refreshAndRunPolicy())
      .catch((error: unknown) => console.error('The isolated video demo could not be staged.', error)), 1200)
  }
  setInterval(() => void refreshAndRunPolicy().catch(() => undefined), 15_000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  void app.whenReady().then(startApplication).catch((error: unknown) => {
    console.error('Lifeguard failed to start safely.', error)
    isQuitting = true
    app.quit()
  })
}

app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy()
})

app.on('window-all-closed', () => {
  // Lifeguard remains in the tray on every platform.
})
