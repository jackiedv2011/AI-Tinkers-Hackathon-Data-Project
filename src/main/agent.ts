import { ChildProcess, fork } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join, parse, relative, resolve } from 'node:path'
import { appendAction, getActions, getProfile, getQuarantine, saveProfile, saveQuarantine } from './store'
import { observeSystem, requestGracefulClose } from './observer'
import type { ActionLogEntry, LifeguardState, ProcessInfo, QuarantineEntry, SystemSnapshot } from '../shared/types'

const SAFE_EXTENSIONS = new Set(['.zip', '.msi', '.exe'])
const observedActivity = new Map<number, string>()
let snapshot: SystemSnapshot | null = null
let demoWorker: ChildProcess | null = null
let demoWorkerPid: number | null = null

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`
}

function logAction(input: Omit<ActionLogEntry, 'id' | 'timestamp' | 'restoredAt'>): void {
  appendAction({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    restoredAt: null,
    ...input
  })
}

function isInside(candidate: string, parent: string): boolean {
  const pathBetween = relative(resolve(parent), resolve(candidate))
  return pathBetween === '' || (!pathBetween.startsWith('..') && !pathBetween.startsWith('/') && !pathBetween.startsWith('\\'))
}

function isProtected(filePath: string): boolean {
  return getProfile().protectedFolders.some((folder) => folder && isInside(filePath, folder))
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

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const child = join(directory, entry.name)
      if (entry.isDirectory()) await walk(child)
      if (entry.isFile()) files.push(child)
    }
  }
  await walk(root)
  return files
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

function uniqueQuarantinePath(filePath: string, hash: string): string {
  const profile = getProfile()
  const item = parse(filePath)
  return join(profile.quarantineFolder, `${item.name}-${hash.slice(0, 8)}${item.ext}`)
}

export async function scanDuplicates(): Promise<number> {
  const profile = getProfile()
  if (!profile.downloadsFolder) return 0
  try {
    await access(profile.downloadsFolder)
  } catch {
    return 0
  }

  const oldestAllowed = Date.now() - profile.duplicateAgeDays * 24 * 60 * 60 * 1000
  const candidates: { path: string; size: number; modified: number; hash: string }[] = []
  for (const filePath of await listFiles(profile.downloadsFolder)) {
    if (isProtected(filePath) || isInside(filePath, profile.quarantineFolder)) continue
    if (!SAFE_EXTENSIONS.has(extname(filePath).toLowerCase())) continue
    const info = await stat(filePath)
    if (info.mtimeMs > oldestAllowed) continue
    candidates.push({ path: filePath, size: info.size, modified: info.mtimeMs, hash: await hashFile(filePath) })
  }

  const groups = new Map<string, typeof candidates>()
  for (const candidate of candidates) groups.set(candidate.hash, [...(groups.get(candidate.hash) ?? []), candidate])
  let count = 0
  const alreadyHandled = new Set(getQuarantine().filter((entry) => !entry.restoredAt).map((entry) => entry.originalPath))

  for (const [hash, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => b.modified - a.modified)
    for (const redundant of sorted.slice(1)) {
      if (alreadyHandled.has(redundant.path)) continue
      const quarantinePath = uniqueQuarantinePath(redundant.path, hash)
      await moveSafely(redundant.path, quarantinePath)
      const entry: QuarantineEntry = {
        id: randomUUID(),
        originalPath: redundant.path,
        quarantinePath,
        hash,
        sizeBytes: redundant.size,
        quarantinedAt: new Date().toISOString(),
        restoredAt: null
      }
      saveQuarantine([entry, ...getQuarantine()])
      logAction({
        type: 'file_quarantine',
        rule: 'duplicate-download-rule',
        detail: `Quarantined ${basename(redundant.path)} (${formatBytes(redundant.size)}) - exact match to ${basename(sorted[0].path)}.`,
        reversible: true
      })
      count += 1
    }
  }
  return count
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
  const items = getQuarantine().map((item) => (item.id === id ? { ...item, restoredAt: new Date().toISOString() } : item))
  saveQuarantine(items)
  logAction({
    type: 'restore',
    rule: 'quarantine-restore',
    detail: `Restored ${basename(destination)} to ${dirname(destination)}.`,
    reversible: false
  })
  return true
}

function isPausable(process: ProcessInfo): boolean {
  const profile = getProfile()
  return profile.pausableProcesses.some((name) => name.toLowerCase() === process.name.toLowerCase())
}

function inactiveForMinutes(process: ProcessInfo): number {
  const lastActive = observedActivity.get(process.pid)
  if (!lastActive) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(lastActive).getTime()) / 60_000
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
  // macOS requires Accessibility permission to identify the foreground app. If
  // that context is unavailable, Lifeguard must fail closed rather than risk it.
  if (current.platform === 'darwin' && !current.foregroundPid) return false
  if (current.availableMemoryMb >= profile.memoryThresholdMb) return false
  const candidates = current.processes
    .filter((process) => process.pid !== current.foregroundPid)
    .filter((process) => !profile.protectedApps.some((name) => name.toLowerCase() === process.name.toLowerCase()))
    .filter((process) => isPausable(process) || process.pid === demoWorkerPid)
    .filter((process) => inactiveForMinutes(process) >= profile.idleMinutes)
    .sort((a, b) => b.memoryMb - a.memoryMb)
  const candidate = candidates[0]
  if (!candidate) return false

  const closed = candidate.pid === demoWorkerPid ? await pauseDemoWorker() : await requestGracefulClose(candidate.pid)
  if (!closed) return false
  logAction({
    type: 'process_paused',
    rule: 'memory-pressure-rule',
    detail: `Paused ${candidate.name} (${Math.round(candidate.memoryMb)} MB) because available memory was ${Math.round(current.availableMemoryMb)} MB and it was inactive.`,
    reversible: candidate.pid === demoWorkerPid
  })
  return true
}

export async function refreshAndRunPolicy(): Promise<SystemSnapshot> {
  snapshot = await observeSystem()
  if (snapshot.foregroundPid) observedActivity.set(snapshot.foregroundPid, snapshot.observedAt)
  await runProcessPolicy(snapshot)
  await scanDuplicates()
  return snapshot
}

export async function stageLiveDemo(): Promise<void> {
  const profile = getProfile()
  if (!profile.downloadsFolder) throw new Error('Choose a folder Lifeguard may inspect before staging the demo.')
  await mkdir(profile.downloadsFolder, { recursive: true })
  const data = Buffer.alloc(4 * 1024 * 1024, 5)
  const primary = join(profile.downloadsFolder, 'Lifeguard-demo-installer.zip')
  const duplicate = join(profile.downloadsFolder, 'Lifeguard-demo-installer-copy.zip')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(primary, data)
  await writeFile(duplicate, data)

  if (!demoWorker) {
    const workerPath = join(__dirname, 'demo-worker.js')
    demoWorker = fork(workerPath, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, silent: true })
    demoWorkerPid = demoWorker.pid ?? null
  }
  const current = await observeSystem()
  saveProfile({
    duplicateAgeDays: 0,
    idleMinutes: 0,
    memoryThresholdMb: Math.ceil(current.availableMemoryMb + 1),
    demoMode: true
  })
}

export function getState(): LifeguardState {
  return {
    profile: getProfile(),
    actions: getActions(),
    quarantine: getQuarantine(),
    snapshot,
    watching: true
  }
}
