import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'node:path'
import type { ActionLogEntry, Profile, QuarantineEntry } from '../shared/types'

type PersistedState = {
  profile: Profile
  actions: ActionLogEntry[]
  quarantine: QuarantineEntry[]
}

type StateStore = {
  get<Key extends keyof PersistedState>(key: Key): PersistedState[Key]
  set<Key extends keyof PersistedState>(key: Key, value: PersistedState[Key]): void
}

// electron-store is ESM. Electron's production main bundle externalizes it as a
// CommonJS require, so normalize both module shapes before constructing it.
const ElectronStore = ((Store as unknown as { default?: typeof Store }).default ?? Store) as typeof Store

const defaultProfile = (): Profile => ({
  protectedFolders: [],
  protectedApps: ['Code', 'Code - Insiders'],
  pausableProcesses: [],
  downloadsFolder: '',
  quarantineFolder: join(app.getPath('userData'), 'Quarantine'),
  duplicateAgeDays: 30,
  memoryThresholdMb: 1024,
  idleMinutes: 20,
  demoMode: false
})

export const stateStore = new ElectronStore<PersistedState>({
  name: 'lifeguard-state',
  defaults: {
    profile: defaultProfile(),
    actions: [],
    quarantine: []
  }
}) as unknown as StateStore

export function getProfile(): Profile {
  return stateStore.get('profile')
}

export function saveProfile(partial: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...partial }
  stateStore.set('profile', next)
  return next
}

export function getActions(): ActionLogEntry[] {
  return stateStore.get('actions')
}

export function appendAction(entry: ActionLogEntry): void {
  stateStore.set('actions', [entry, ...getActions()].slice(0, 100))
}

export function getQuarantine(): QuarantineEntry[] {
  return stateStore.get('quarantine')
}

export function saveQuarantine(entries: QuarantineEntry[]): void {
  stateStore.set('quarantine', entries)
}
