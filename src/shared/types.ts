export type ActionType = 'file_quarantine' | 'process_paused' | 'restore'

export type Profile = {
  protectedFolders: string[]
  protectedApps: string[]
  pausableProcesses: string[]
  downloadsFolder: string
  quarantineFolder: string
  duplicateAgeDays: number
  memoryThresholdMb: number
  idleMinutes: number
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

export type LifeguardState = {
  profile: Profile
  actions: ActionLogEntry[]
  quarantine: QuarantineEntry[]
  snapshot: SystemSnapshot | null
  watching: boolean
}
