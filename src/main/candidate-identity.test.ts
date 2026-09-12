import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyCandidateIdentity } from './candidate-identity'

test('duplicate identity is revalidated immediately before autonomous action', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lifeguard-identity-'))
  try {
    const canonical = join(folder, 'canonical.bin')
    const candidatePath = join(folder, 'candidate.bin')
    await writeFile(canonical, Buffer.alloc(1024, 7))
    await writeFile(candidatePath, Buffer.alloc(1024, 7))
    const info = await stat(candidatePath)
    const candidate = {
      path: candidatePath,
      duplicateOf: canonical,
      sizeBytes: info.size,
      modifiedAt: info.mtimeMs,
      category: 'duplicate' as const,
      reason: 'test',
      importance: 0
    }
    assert.ok(await verifyCandidateIdentity(candidate))
    await writeFile(candidatePath, Buffer.alloc(1024, 8))
    assert.equal(await verifyCandidateIdentity(candidate), null)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
