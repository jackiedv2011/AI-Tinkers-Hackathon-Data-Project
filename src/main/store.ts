import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'node:path'
import type { ActionLogEntry, Profile, QuarantineEntry, StorageIndexState } from '../shared/types'

type PersistedState = {
  profile: Profile
  actions: ActionLogEntry[]
  quarantine: QuarantineEntry[]
  storageIndex: StorageIndexState
}

type StateStore = {
  get<Key extends keyof PersistedState>(key: Key): PersistedState[Key]
  set<Key extends keyof PersistedState>(key: Key, value: PersistedState[Key]): void
}

const ElectronStore = ((Store as unknown as { default?: typeof Store }).default ?? Store) as typeof Store

const defaultProfile = (): Profile => ({
  protectedFolders: [],
  protectedApps: ['Code', 'Code - Insiders', 'Visual Studio', 'Terminal', 'WindowsTerminal'],
  autoPausableApps: ['Discord', 'Slack', 'Teams', 'Spotify', 'Steam', 'EpicGamesLauncher'],
  quarantineFolder: join(app.getPath('userData'), 'Quarantine'),
  duplicateAgeDays: 30,
  disposableAgeDays: 14,
  memoryThresholdMb: 1024,
  idleMinutes: 45,
  scanBudgetFiles: 500,
  scanBudgetMs: 1500,
  minCandidateSizeBytes: 1024 * 1024,
  learningHours: 24,
  armedAt: new Date().toISOString(),
  demoMode: false
})

const defaultStorageIndex = (): StorageIndexState => ({
  volumes: [],
  queue: [],
  processedFiles: 0,
  processedBytes: 0,
  excludedPaths: 0,
  errors: 0,
  cycle: 0,
  status: 'discovering',
  cycleStartedAt: null,
  lastCompletedAt: null,
  lastTickAt: null,
  representatives: {},
  hashes: {}
})

const initialProfile = defaultProfile()

export const stateStore = new ElectronStore<PersistedState>({
  name: 'lifeguard-state',
  defaults: {
    profile: initialProfile,
    actions: [],
    quarantine: [],
    storageIndex: defaultStorageIndex()
  }
}) as unknown as StateStore

export function getProfile(): Profile {
  const stored = stateStore.get('profile') ?? ({} as Profile)
  const merged = { ...initialProfile, ...stored }
  if (!stored.armedAt || !stored.autoPausableApps || !stored.scanBudgetFiles) stateStore.set('profile', merged)
  return merged
}

export function saveProfile(partial: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...partial }
  stateStore.set('profile', next)
  return next
}

export function getActions(): ActionLogEntry[] {
  return stateStore.get('actions') ?? []
}

export function appendAction(entry: ActionLogEntry): void {
  stateStore.set('actions', [entry, ...getActions()].slice(0, 250))
}

export function getQuarantine(): QuarantineEntry[] {
  return (stateStore.get('quarantine') ?? []).map((entry) => ({ ...entry, category: entry.category ?? 'duplicate', reason: entry.reason ?? 'Exact duplicate' }))
}

export function saveQuarantine(entries: QuarantineEntry[]): void {
  stateStore.set('quarantine', entries)
}

export function getStorageIndex(): StorageIndexState {
  const merged = { ...defaultStorageIndex(), ...(stateStore.get('storageIndex') ?? {}) }
  merged.representatives = Object.fromEntries(Object.entries(merged.representatives).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]))
  return merged
}

export function saveStorageIndex(index: StorageIndexState): void {
  stateStore.set('storageIndex', index)
}
