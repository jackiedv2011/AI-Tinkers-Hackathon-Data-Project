import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getState: () => ipcRenderer.invoke('state:get'),
  getAppIcon: (pid: number) => ipcRenderer.invoke('app:icon', pid),
  refresh: () => ipcRenderer.invoke('state:refresh'),
  chooseProtectedFolder: () => ipcRenderer.invoke('folder:choose-protected'),
  startStorageScan: () => ipcRenderer.invoke('storage:scan-now'),
  restore: (id: string) => ipcRenderer.invoke('quarantine:restore', id),
  stageDemo: () => ipcRenderer.invoke('demo:stage'),
  setWatching: (watching: boolean) => ipcRenderer.invoke('agent:set-watching', watching),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: { openAtLogin: boolean }) => ipcRenderer.invoke('settings:update', settings),
  onNavigate: (callback: (page: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, page: string): void => callback(page)
    ipcRenderer.on('ui:navigate', handler)
    ipcRenderer.send('ui:ready')
    return () => ipcRenderer.removeListener('ui:navigate', handler)
  }
}

contextBridge.exposeInMainWorld('lifeguard', api)
