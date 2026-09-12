import { contextBridge, ipcRenderer } from 'electron'
import type { Profile } from '../shared/types'

const api = {
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('state:refresh'),
  updateProfile: (partial: Partial<Profile>) => ipcRenderer.invoke('profile:update', partial),
  chooseProtectedFolder: () => ipcRenderer.invoke('folder:choose-protected'),
  startStorageScan: () => ipcRenderer.invoke('storage:scan-now'),
  restore: (id: string) => ipcRenderer.invoke('quarantine:restore', id),
  stageDemo: () => ipcRenderer.invoke('demo:stage')
}

contextBridge.exposeInMainWorld('lifeguard', api)
