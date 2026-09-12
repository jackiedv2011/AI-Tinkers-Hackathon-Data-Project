import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('state:refresh'),
  chooseProtectedFolder: () => ipcRenderer.invoke('folder:choose-protected'),
  startStorageScan: () => ipcRenderer.invoke('storage:scan-now'),
  restore: (id: string) => ipcRenderer.invoke('quarantine:restore', id),
  stageDemo: () => ipcRenderer.invoke('demo:stage')
}

contextBridge.exposeInMainWorld('lifeguard', api)
