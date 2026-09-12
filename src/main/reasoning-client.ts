import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod/v4'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type { ReasoningCandidateRecord } from '../shared/types'

export const ReasoningAssessmentSchema = z.object({
  fingerprint: z.string(),
  verdict: z.enum(['protect', 'neutral']),
  confidence: z.number().min(0).max(1),
  reason: z.string()
})

export const ReasoningOutputSchema = z.object({
  summary: z.string(),
  observations: z.array(z.string()).max(4),
  assessments: z.array(ReasoningAssessmentSchema).max(50)
})

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>

export type CandidateFeature = {
  fingerprint: string
  category: ReasoningCandidateRecord['category']
  extension: string
  sizeMb: number
  ageDays: number
  locationClass: 'temporary' | 'cache' | 'downloads' | 'personal' | 'project' | 'other'
  baseImportance: number
  evidence: string[]
}

export type ReasoningDigest = {
  platform: string
  freeMemoryBucket: string
  fixedVolumeCount: number
  indexedFileCount: number
  previousRestoreCount: number
  candidates: CandidateFeature[]
}

export type LifeguardReasoningEffort = 'low' | 'medium' | 'high'

export function candidateFingerprint(record: Pick<ReasoningCandidateRecord, 'path' | 'sizeBytes' | 'modifiedAt' | 'category' | 'hash' | 'duplicateOf'>): string {
  const identity = [
    record.path.toLowerCase(),
    record.sizeBytes,
    Math.trunc(record.modifiedAt),
    record.category,
    record.hash ?? '',
    record.duplicateOf?.toLowerCase() ?? ''
  ]
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 20)
}

function locationClass(record: ReasoningCandidateRecord): CandidateFeature['locationClass'] {
  if (record.category === 'temp') return 'temporary'
  if (record.category === 'cache') return 'cache'
  const path = record.path.toLowerCase()
  if (/[\\/]downloads[\\/]/.test(path)) return 'downloads'
  if (/[\\/](desktop|documents|pictures|movies|music)[\\/]/.test(path)) return 'personal'
  if (/[\\/](projects|workspace|repos|src)[\\/]/.test(path)) return 'project'
  return 'other'
}

export function toCandidateFeature(record: ReasoningCandidateRecord, now = Date.now()): CandidateFeature {
  return {
    fingerprint: record.fingerprint,
    category: record.category,
    extension: extname(record.path).toLowerCase().slice(0, 12) || 'none',
    sizeMb: Math.round(record.sizeBytes / 1024 / 1024 * 10) / 10,
    ageDays: Math.max(0, Math.floor((now - record.modifiedAt) / 86_400_000)),
    locationClass: locationClass(record),
    baseImportance: record.importance,
    evidence: [
      record.category === 'duplicate' ? 'sha256_exact_duplicate' : 'recognized_disposable_tree',
      'deterministic_safety_gate_passed',
      'recent_and_protected_paths_already_excluded'
    ]
  }
}

export async function runReasoningRequest(apiKey: string, model: string, digest: ReasoningDigest, effort: LifeguardReasoningEffort = 'medium'): Promise<ReasoningOutput> {
  const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 })
  const response = await client.responses.parse({
    model,
    store: false,
    reasoning: { effort },
    instructions: [
      'You are Lifeguard Context Reasoner, a conservative privacy-preserving advisor for a desktop resource guardian.',
      'You receive anonymized metadata only. Never infer a filename, identity, file contents, or exact location.',
      'For every candidate, return protect when personal intent, project value, or ambiguity could exist. Return neutral only when the supplied deterministic evidence remains unambiguous.',
      'You can only add protection. You cannot authorize deletion, process termination, or any filesystem action.',
      'Keep the summary and reasons concise and factual.'
    ].join(' '),
    input: JSON.stringify(digest),
    text: { format: zodTextFormat(ReasoningOutputSchema, 'lifeguard_context_assessment') },
    max_output_tokens: 1200
  })
  if (response.status !== 'completed' || !response.output_parsed) throw new Error('Reasoning response was incomplete.')
  return response.output_parsed
}
