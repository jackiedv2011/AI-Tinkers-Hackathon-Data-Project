import { app, dialog, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { basename, join } from 'node:path'
import { getState, setWatching } from './agent'

type Page = 'Home' | 'Activity' | 'Quarantine' | 'Rules' | 'Devices' | 'Settings'
const formatBytes = (value: number): string => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
const titles = { file_quarantine: 'Duplicate held safely', cache_quarantine: 'Disposable file held safely', process_paused: 'Idle app closed', restore: 'File restored' }

// Rasterized directly from the website's Headroom mark for Windows native icons.
function trayImage(paused: boolean, acting: boolean): Electron.NativeImage {
  const state = paused ? 'paused' : acting ? 'checking' : 'watching'
  return nativeImage.createFromPath(join(__dirname, `../renderer/art/headroom-tray-${state}.png`))
}
export function installTray(navigate: (page: Page) => void, changeProject: () => Promise<void>, quit: () => void): Tray {
  const tray = new Tray(trayImage(false, false))
  let signature = ''
  const safely = (task: () => Promise<void>): void => { void task().catch(error => dialog.showErrorBox('Headroom could not complete that action', error instanceof Error ? error.message : String(error))) }
  const update = (): void => {
    if (tray.isDestroyed()) return
    const state = getState(), held = state.quarantine.filter(item => !item.restoredAt)
    const status = !state.watching ? 'Paused' : state.acting ? 'Checking your system' : 'Watching quietly'
    const next = JSON.stringify([state.watching, state.acting, state.profile.protectedFolders, held.map(item => item.id), state.actions.slice(0, 2).map(item => item.id)])
    if (signature === next) return
    signature = next
    const projects: MenuItemConstructorOptions[] = state.profile.protectedFolders.map(folder => ({ label: basename(folder), type: 'checkbox', checked: true, enabled: false }))
    const recent: MenuItemConstructorOptions[] = state.actions.slice(0, 2).map(entry => ({ label: `${titles[entry.type]} · ${new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, click: () => navigate('Activity') }))
    tray.setImage(trayImage(!state.watching, !!state.acting))
    tray.setToolTip(`Headroom · ${status}${state.profile.protectedFolders[0] ? `\nProtecting ${basename(state.profile.protectedFolders[0])}` : ''}`)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Headroom', click: () => navigate('Home') },
      { type: 'separator' },
      { label: 'Protected project', submenu: [...(projects.length ? projects : [{ label: 'No project selected', enabled: false }]), { type: 'separator' }, { label: 'Change project…', click: () => safely(async () => { await changeProject(); update() }) }] },
      { label: `Status · ${status}`, submenu: [{ label: status, enabled: false }, { label: state.watching ? 'Pause Headroom' : 'Resume Headroom', click: () => safely(async () => { await setWatching(!state.watching); update() }) }] },
      { type: 'separator' },
      { label: 'Recent activity', submenu: [...(recent.length ? recent : [{ label: 'No actions yet', enabled: false }]), { type: 'separator' }, { label: 'View all activity…', click: () => navigate('Activity') }] },
      { label: 'Quarantine', submenu: [{ label: `${held.length} items · ${formatBytes(held.reduce((sum, item) => sum + item.sizeBytes, 0))} held`, enabled: false }, { label: 'Open Quarantine', click: () => navigate('Quarantine') }] },
      { type: 'separator' },
      { label: 'Settings', click: () => navigate('Settings') },
      { label: 'Quit Headroom', click: quit }
    ]))
  }
  update()
  const timer = setInterval(update, 2000)
  app.once('before-quit', () => clearInterval(timer))
  tray.on('click', () => navigate('Home'))
  return tray
}

