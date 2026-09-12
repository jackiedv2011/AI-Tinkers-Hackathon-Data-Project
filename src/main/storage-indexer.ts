import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { app } from 'electron'
import type { IndexedFile, Profile, StorageIndexState } from '../shared/types'
import { getStorageIndex, saveStorageIndex } from './store'
import { discoverFixedDrives } from './observer'
import { classifyDisposablePath, importanceScore, shouldSkipPath } from './path-policy'
import { isDemoPath } from './demo-paths'

export type CleanupCandidate = {
  path: string
  sizeBytes: number
  modifiedAt: number
  category: 'duplicate' | 'cache' | 'temp'
  reason: string
  duplicateOf?: string
  hash?: string
  importance: number
}

type CandidateHandler = (candidate: CleanupCandidate) => Promise<boolean>

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

function isOldEnough(modifiedAt: number, days: number): boolean {
  return modifiedAt <= Date.now() - days * 86_400_000
}

async function detectDuplicate(index: StorageIndexState, file: IndexedFile): Promise<CleanupCandidate | null> {
  const key = String(file.sizeBytes)
  const stored = index.representatives[key]
  const representatives = Array.isArray(stored) ? stored : stored ? [stored as unknown as IndexedFile] : []
  if (representatives.length === 0) {
    index.representatives[key] = [file]
    return null
  }
  if (representatives.some((item) => item.path === file.path)) return null
  try {
    const currentHash = await hashFile(file.path)
    file.hash = currentHash
    for (const representative of representatives) {
      representative.hash ??= await hashFile(representative.path)
      if (representative.hash === currentHash) {
        index.representatives[key] = representatives
        const group = index.hashes[currentHash] ?? [representative]
        if (!group.some((item) => item.path === file.path)) group.push(file)
        index.hashes[currentHash] = group.slice(-12)
        return {
          path: file.path,
          sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAt,
          category: 'duplicate',
          reason: `Exact SHA-256 match to ${representative.path}`,
          duplicateOf: representative.path,
          hash: currentHash,
          importance: 0
        }
      }
    }
    // Keep one hashed representative for every distinct payload of this size.
    // A cap creates false negatives when a common size (for example 4 MB) has
    // many distinct files before an exact duplicate appears later in the scan.
    representatives.push(file)
    index.representatives[key] = representatives
    return null
  } catch {
    return null
  }
}

async function startCycle(index: StorageIndexState): Promise<StorageIndexState> {
  const volumes = await discoverFixedDrives()
  return {
    ...index,
    volumes,
    queue: volumes.map((volume) => volume.root).reverse(),
    processedFiles: 0,
    processedBytes: 0,
    excludedPaths: 0,
    errors: 0,
    cycle: index.cycle + 1,
    status: 'indexing',
    cycleStartedAt: new Date().toISOString(),
    representatives: {},
    hashes: {}
  }
}

export async function queuePriorityPath(filePath: string): Promise<void> {
  const index = getStorageIndex()
  index.queue.push(filePath)
  index.status = 'indexing'
  saveStorageIndex(index)
}

export async function restartStorageCycle(): Promise<StorageIndexState> {
  const next = await startCycle(getStorageIndex())
  saveStorageIndex(next)
  return next
}

export async function scanStorageTick(profile: Profile, handleCandidate: CandidateHandler): Promise<StorageIndexState> {
  let index = getStorageIndex()
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
  if (index.queue.length === 0 && (!index.lastCompletedAt || new Date(index.lastCompletedAt).getTime() < sixHoursAgo)) {
    index = await startCycle(index)
  }
  if (index.queue.length === 0) return index

  const started = Date.now()
  let filesThisTick = 0
  const userHome = app.getPath('home')
  const actedPaths = new Set<string>()
  while (index.queue.length && filesThisTick < profile.scanBudgetFiles && Date.now() - started < profile.scanBudgetMs) {
    const target = index.queue.pop()!
    const isDemoTarget = profile.demoMode && isDemoPath(target)
    if (!isDemoTarget && shouldSkipPath(target, userHome, profile.protectedFolders, profile.quarantineFolder)) {
      index.excludedPaths += 1
      continue
    }
    try {
      const info = await lstat(target)
      if (info.isSymbolicLink()) {
        index.excludedPaths += 1
        continue
      }
      if (info.isDirectory()) {
        const entries = await readdir(target)
        for (let position = entries.length - 1; position >= 0; position -= 1) index.queue.push(`${target}${target.endsWith('/') || target.endsWith('\\') ? '' : process.platform === 'win32' ? '\\' : '/'}${entries[position]}`)
        continue
      }
      if (!info.isFile()) continue
      filesThisTick += 1
      index.processedFiles += 1
      index.processedBytes += info.size
      if (info.size < profile.minCandidateSizeBytes || info.size > 512 * 1024 * 1024) continue

      const file: IndexedFile = { path: target, sizeBytes: info.size, modifiedAt: info.mtimeMs, accessedAt: info.atimeMs }
      const disposable = classifyDisposablePath(target, userHome)
      const importance = importanceScore(target, info.mtimeMs, info.atimeMs, profile.protectedFolders, disposable)
      if (disposable && isOldEnough(info.mtimeMs, isDemoTarget ? 0 : profile.disposableAgeDays) && importance <= 0) {
        if (await handleCandidate({
          path: target,
          sizeBytes: info.size,
          modifiedAt: info.mtimeMs,
          category: disposable,
          reason: `${disposable === 'cache' ? 'Regenerable cache' : 'Temporary file'} untouched for ${profile.disposableAgeDays}+ days`,
          importance
        })) actedPaths.add(target)
        continue
      }

      const duplicate = await detectDuplicate(index, file)
      if (duplicate && !actedPaths.has(duplicate.path)) {
        duplicate.importance = isDemoTarget ? -100 : importanceScore(duplicate.path, info.mtimeMs, info.atimeMs, profile.protectedFolders, null)
        if (isOldEnough(info.mtimeMs, isDemoTarget ? 0 : profile.duplicateAgeDays) && duplicate.importance <= 10) {
          if (await handleCandidate(duplicate)) actedPaths.add(duplicate.path)
        }
      }
    } catch {
      index.errors += 1
    }
  }
  index.lastTickAt = new Date().toISOString()
  if (index.queue.length === 0) {
    index.status = 'complete'
    index.lastCompletedAt = index.lastTickAt
  } else {
    index.status = 'indexing'
  }
  saveStorageIndex(index)
  return index
}
