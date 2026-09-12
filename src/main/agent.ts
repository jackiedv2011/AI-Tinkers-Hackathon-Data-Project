import { ChildProcess, fork } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, rename, unlink, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, join, parse } from 'node:path'
import { appendAction, getActions, getProfile, getQuarantine, getStorageIndex, saveProfile, saveQuarantine } from './store'
import { observeSystem, requestGracefulClose } from './observer'
import { isInside } from './path-policy'
import { queuePriorityPath, restartStorageCycle, scanStorageTick, type CleanupCandidate } from './storage-indexer'
import { getDemoFolders, isDemoPath } from './demo-paths'
import type { ActionLogEntry, LifeguardState, ProcessInfo, QuarantineEntry, SystemSnapshot } from '../shared/types'

const observedSince = new Map<number, number>()
const observedActivity = new Map<number, number>()
const NEVER_PAUSE = new Set(['onedrive', 'dropbox', 'googledrivefs', 'icloud', 'icloud drive', 'antimalware service executable', 'msmpeng'])
let snapshot: SystemSnapshot | null = null
let demoWorker: ChildProcess | null = null
let demoWorkerPid: number | null = null
let refreshInFlight: Promise<SystemSnapshot> | null = null

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

function logAction(input: Omit<ActionLogEntry, 'id' | 'timestamp' | 'restoredAt'>): void {
  appendAction({ id: randomUUID(), timestamp: new Date().toISOString(), restoredAt: null, ...input })
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    hash.on('error', reject)
    hash.on('finish', () => resolveHash(hash.digest('hex')))
    stream.pipe(hash)
  })
}

async function moveSafely(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(source, target)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(source, target)
    await unlink(source)
  }
}

function uniqueQuarantinePath(filePath: string): string {
  const item = parse(filePath)
  return join(getProfile().quarantineFolder, `${item.name}-${randomUUID().slice(0, 8)}${item.ext}`)
}

function learningPeriodComplete(): boolean {
  const profile = getProfile()
  return Date.now() >= new Date(profile.armedAt).getTime() + profile.learningHours * 3_600_000
}

async function quarantineCandidate(candidate: CleanupCandidate): Promise<boolean> {
  const profile = getProfile()
  const isDemo = profile.demoMode && isDemoPath(candidate.path)
  if (!isDemo && !learningPeriodComplete()) return false
  if (profile.protectedFolders.some((folder) => folder && isInside(candidate.path, folder))) return false
  if (isInside(candidate.path, profile.quarantineFolder)) return false
  if (getQuarantine().some((entry) => !entry.restoredAt && entry.originalPath === candidate.path)) return false
  if (candidate.category === 'duplicate' && candidate.duplicateOf) {
    try {
      await access(candidate.duplicateOf)
    } catch {
      return false
    }
  }

  try {
    const hash = candidate.hash ?? await hashFile(candidate.path)
    const quarantinePath = uniqueQuarantinePath(candidate.path)
    await moveSafely(candidate.path, quarantinePath)
    const entry: QuarantineEntry = {
      id: randomUUID(),
      originalPath: candidate.path,
      quarantinePath,
      hash,
      sizeBytes: candidate.sizeBytes,
      category: candidate.category,
      reason: candidate.reason,
      quarantinedAt: new Date().toISOString(),
      restoredAt: null
    }
    saveQuarantine([entry, ...getQuarantine()])
    logAction({
      type: candidate.category === 'duplicate' ? 'file_quarantine' : 'cache_quarantine',
      rule: candidate.category === 'duplicate' ? 'whole-drive-exact-duplicate' : 'known-disposable-path',
      detail: `Moved ${basename(candidate.path)} (${formatBytes(candidate.sizeBytes)}) to recoverable quarantine. ${candidate.reason}.`,
      reversible: true
    })
    return true
  } catch {
    return false
  }
}

export async function restoreQuarantine(id: string): Promise<boolean> {
  const entry = getQuarantine().find((item) => item.id === id && !item.restoredAt)
  if (!entry) return false
  try {
    await access(entry.quarantinePath)
  } catch {
    return false
  }
  let destination = entry.originalPath
  try {
    await access(destination)
    const item = parse(destination)
    destination = join(item.dir, `${item.name}.restored-${Date.now()}${item.ext}`)
  } catch {
    // The original path is available.
  }
  await moveSafely(entry.quarantinePath, destination)
  saveQuarantine(getQuarantine().map((item) => item.id === id ? { ...item, restoredAt: new Date().toISOString() } : item))
  logAction({ type: 'restore', rule: 'quarantine-restore', detail: `Restored ${basename(destination)} to ${dirname(destination)}.`, reversible: false })
  return true
}

function matchesAutoPausable(process: ProcessInfo): boolean {
  const processName = process.name.toLowerCase()
  return getProfile().autoPausableApps.some((name) => processName === name.toLowerCase() || processName.startsWith(`${name.toLowerCase()}-`))
}

function inactiveForMinutes(process: ProcessInfo): number {
  const latestContext = Math.max(observedSince.get(process.pid) ?? Date.now(), observedActivity.get(process.pid) ?? 0)
  return (Date.now() - latestContext) / 60_000
}

async function pauseDemoWorker(): Promise<boolean> {
  if (!demoWorker || !demoWorkerPid) return false
  demoWorker.send({ type: 'shutdown' })
  const exited = await new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), 2500)
    demoWorker?.once('exit', () => {
      clearTimeout(timer)
      resolveExit(true)
    })
  })
  if (exited) {
    demoWorker = null
    demoWorkerPid = null
  }
  return exited
}

async function runProcessPolicy(current: SystemSnapshot): Promise<boolean> {
  const profile = getProfile()
  if (current.platform === 'darwin' && !current.foregroundPid) return false
  const underPressure = current.availableMemoryMb < profile.memoryThresholdMb
  if (!underPressure && !demoWorkerPid) return false
  const candidates = current.processes
    .filter((process) => process.pid !== current.foregroundPid)
    .filter((process) => !NEVER_PAUSE.has(process.name.toLowerCase()))
    .filter((process) => !profile.protectedApps.some((name) => name.toLowerCase() === process.name.toLowerCase()))
    .filter((process) => process.pid === demoWorkerPid || (process.hasWindow && matchesAutoPausable(process)))
    .filter((process) => process.pid === demoWorkerPid || inactiveForMinutes(process) >= profile.idleMinutes)
    .sort((a, b) => b.memoryMb - a.memoryMb)
  const candidate = candidates[0]
  if (!candidate) return false
  const closed = candidate.pid === demoWorkerPid ? await pauseDemoWorker() : await requestGracefulClose(candidate.pid)
  if (!closed) return false
  logAction({
    type: 'process_paused',
    rule: 'context-aware-memory-pressure',
    detail: `Closed idle ${candidate.name} gracefully (${Math.round(candidate.memoryMb)} MB) while memory was constrained. Foreground work and sync clients stayed protected.`,
    reversible: candidate.pid === demoWorkerPid
  })
  return true
}

async function executePolicyCycle(): Promise<SystemSnapshot> {
  snapshot = await observeSystem()
  const now = Date.now()
  for (const process of snapshot.processes) if (!observedSince.has(process.pid)) observedSince.set(process.pid, now)
  if (snapshot.foregroundPid) observedActivity.set(snapshot.foregroundPid, now)
  await runProcessPolicy(snapshot)
  await scanStorageTick(getProfile(), quarantineCandidate)
  if (getProfile().demoMode) saveProfile({ demoMode: false })
  return snapshot
}

export function refreshAndRunPolicy(): Promise<SystemSnapshot> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = executePolicyCycle().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function startFreshStorageScan(): Promise<void> {
  await restartStorageCycle()
}

export async function stageLiveDemo(): Promise<void> {
  const [demoFolder, demoTempFolder] = getDemoFolders()
  await mkdir(demoFolder, { recursive: true })
  await mkdir(demoTempFolder, { recursive: true })
  const data = Buffer.alloc(4 * 1024 * 1024, 5)
  const demoId = Date.now()
  const primary = join(demoFolder, `Lifeguard-demo-${demoId}-installer.exe`)
  const duplicate = join(demoFolder, `Lifeguard-demo-${demoId}-installer-copy.exe`)
  await writeFile(primary, data)
  await writeFile(duplicate, data)
  const staleCache = join(demoTempFolder, `Lifeguard-demo-${demoId}-stale-cache.tmp`)
  await writeFile(staleCache, Buffer.alloc(3 * 1024 * 1024, 7))
  const oldTime = new Date(Date.now() - 45 * 86_400_000)
  await utimes(primary, oldTime, oldTime)
  await utimes(duplicate, oldTime, oldTime)
  await utimes(staleCache, oldTime, oldTime)

  if (!demoWorker) {
    const workerPath = join(__dirname, 'demo-worker.js')
    demoWorker = fork(workerPath, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, silent: true })
    demoWorkerPid = demoWorker.pid ?? null
  }
  saveProfile({ demoMode: true })
  await queuePriorityPath(demoFolder)
  await queuePriorityPath(demoTempFolder)
}

export function getState(): LifeguardState {
  return {
    profile: getProfile(),
    actions: getActions(),
    quarantine: getQuarantine(),
    snapshot,
    storage: getStorageIndex(),
    watching: true
  }
}
