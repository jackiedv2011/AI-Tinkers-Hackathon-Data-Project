import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import type { CleanupCandidate } from './storage-indexer'

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

async function unchangedRegularFile(filePath: string, sizeBytes: number, modifiedAt?: number): Promise<boolean> {
  const info = await lstat(filePath)
  return info.isFile() && !info.isSymbolicLink() && info.size === sizeBytes && (modifiedAt === undefined || Math.abs(info.mtimeMs - modifiedAt) <= 1)
}

export async function verifyCandidateIdentity(candidate: CleanupCandidate): Promise<string | null> {
  try {
    if (!await unchangedRegularFile(candidate.path, candidate.sizeBytes, candidate.modifiedAt)) return null
    const sourceHash = await hashFile(candidate.path)
    if (candidate.hash && sourceHash !== candidate.hash) return null
    if (candidate.category === 'duplicate') {
      if (!candidate.duplicateOf || !await unchangedRegularFile(candidate.duplicateOf, candidate.sizeBytes)) return null
      if (await hashFile(candidate.duplicateOf) !== sourceHash) return null
    }
    return sourceHash
  } catch {
    return null
  }
}
