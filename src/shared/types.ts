export type ActionType = 'file_quarantine' | 'cache_quarantine' | 'process_paused' | 'restore'

export type Profile = {
  protectedFolders: string[]
  protectedApps: string[]
  autoPausableApps: string[]
  quarantineFolder: string
  duplicateAgeDays: number
  disposableAgeDays: number
  memoryThresholdMb: number
  idleMinutes: number
  scanBudgetFiles: number
  scanBudgetMs: number
  minCandidateSizeBytes: number
  learningHours: number
  armedAt: string
  demoMode: boolean
}

export type ActionLogEntry = {
  id: string
  timestamp: string
  type: ActionType
  rule: string
  detail: string
  reversible: boolean
  restoredAt: string | null
}

export type QuarantineEntry = {
  id: string
  originalPath: string
  quarantinePath: string
  hash: string
  sizeBytes: number
  category: 'duplicate' | 'cache' | 'temp'
  reason: string
  quarantinedAt: string
  restoredAt: string | null
}

export type ProcessInfo = {
  pid: number
  name: string
  memoryMb: number
  cpu: number | null
  hasWindow: boolean
}

export type SystemSnapshot = {
  platform: 'win32' | 'darwin' | 'other'
  availableMemoryMb: number
  foregroundPid: number | null
  foregroundName: string | null
  processes: ProcessInfo[]
  observedAt: string
}

export type DriveInfo = {
  root: string
  label: string
  totalBytes: number
  freeBytes: number
}

export type IndexedFile = {
  path: string
  sizeBytes: number
  modifiedAt: number
  accessedAt: number
  hash?: string
}

export type StorageIndexState = {
  volumes: DriveInfo[]
  queue: string[]
  processedFiles: number
  processedBytes: number
  excludedPaths: number
  errors: number
  cycle: number
  status: 'discovering' | 'indexing' | 'complete' | 'paused'
  cycleStartedAt: string | null
  lastCompletedAt: string | null
  lastTickAt: string | null
  representatives: Record<string, IndexedFile[]>
  hashes: Record<string, IndexedFile[]>
}

export type LifeguardState = {
  profile: Profile
  actions: ActionLogEntry[]
  quarantine: QuarantineEntry[]
  snapshot: SystemSnapshot | null
  storage: StorageIndexState
  watching: boolean
}
