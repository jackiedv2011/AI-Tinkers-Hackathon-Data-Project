import assert from 'node:assert/strict'
import test from 'node:test'
import { candidateFingerprint, ReasoningOutputSchema, toCandidateFeature } from './reasoning-client'
import type { ReasoningCandidateRecord } from '../shared/types'

test('reasoning features never contain a raw path or filename', () => {
  const record: ReasoningCandidateRecord = {
    fingerprint: 'anonymous-123',
    path: 'C:\\Users\\alex\\Documents\\Private Thesis\\secret-draft.docx',
    sizeBytes: 8 * 1024 * 1024,
    modifiedAt: Date.now() - 90 * 86_400_000,
    category: 'duplicate',
    reason: 'Exact match to another private path',
    importance: 5
  }
  const serialized = JSON.stringify(toCandidateFeature(record))
  assert.equal(serialized.includes('alex'), false)
  assert.equal(serialized.includes('secret-draft'), false)
  assert.equal(serialized.includes('Private Thesis'), false)
  assert.equal(serialized.includes('another private path'), false)
  assert.equal(serialized.includes('.docx'), true)
})

test('reasoning output can protect or remain neutral but cannot authorize cleanup', () => {
  const valid = ReasoningOutputSchema.safeParse({
    summary: 'Ambiguous personal item protected.',
    observations: [],
    assessments: [{ fingerprint: 'anonymous-123', verdict: 'protect', confidence: 0.9, reason: 'Personal context.' }]
  })
  assert.equal(valid.success, true)
  const invalid = ReasoningOutputSchema.safeParse({
    summary: 'Unsafe output.',
    observations: [],
    assessments: [{ fingerprint: 'anonymous-123', verdict: 'quarantine', confidence: 1, reason: 'Delete it.' }]
  })
  assert.equal(invalid.success, false)
})

test('a changed file cannot reuse an earlier model assessment for the same path', () => {
  const base = {
    path: 'C:\\Users\\alex\\Downloads\\archive.zip',
    sizeBytes: 8 * 1024 * 1024,
    modifiedAt: 1_700_000_000_000,
    category: 'duplicate' as const
  }
  assert.notEqual(candidateFingerprint(base), candidateFingerprint({ ...base, modifiedAt: base.modifiedAt + 1 }))
  assert.notEqual(candidateFingerprint(base), candidateFingerprint({ ...base, sizeBytes: base.sizeBytes + 1 }))
})
