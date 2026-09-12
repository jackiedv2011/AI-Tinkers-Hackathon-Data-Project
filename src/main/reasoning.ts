import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { getActions, getReasoningState, getStorageIndex, saveReasoningState } from './store'
import { runReasoningRequest, toCandidateFeature, type ReasoningDigest } from './reasoning-client'
import type { CleanupCandidate } from './storage-indexer'
import type { ReasoningCandidateRecord, ReasoningPublicState, SystemSnapshot } from '../shared/types'

for (const envPath of new Set([join(process.cwd(), '.env.local'), join(dirname(process.execPath), '.env.local')])) {
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true })
}

let reasoningInFlight: Promise<void> | null = null

function apiKey(): string | null {
  const value = process.env.OPENAI_API_KEY?.trim()
  return value && /^sk-[A-Za-z0-9_-]{20,}$/.test(value) ? value : null
}

export function reasoningModel(): string {
  return process.env.LIFEGUARD_REASONING_MODEL?.trim() || 'gpt-5.6-luna'
}

function fingerprint(filePath: string): string {
  return createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0, 20)
}

function asRecord(candidate: CleanupCandidate): ReasoningCandidateRecord {
  return { fingerprint: fingerprint(candidate.path), ...candidate }
}

export function queueReasoningCandidate(candidate: CleanupCandidate): boolean {
  if (!apiKey()) return false
  const state = getReasoningState()
  const record = asRecord(candidate)
  if (!state.pending.some((item) => item.fingerprint === record.fingerprint)) state.pending.push(record)
  state.pending = state.pending.slice(-50)
  state.status = 'idle'
  state.model = reasoningModel()
  state.error = null
  saveReasoningState(state)
  return true
}

function createDigest(snapshot: SystemSnapshot | null): ReasoningDigest {
  const state = getReasoningState()
  const index = getStorageIndex()
  const memory = snapshot?.availableMemoryMb ?? 0
  return {
    platform: snapshot?.platform ?? process.platform,
    freeMemoryBucket: memory < 1024 ? 'constrained' : memory < 4096 ? 'moderate' : 'healthy',
    fixedVolumeCount: index.volumes.length,
    indexedFileCount: index.processedFiles,
    previousRestoreCount: getActions().filter((action) => action.type === 'restore').length,
    candidates: state.pending.map((candidate) => toCandidateFeature(candidate))
  }
}

async function executeReasoning(snapshot: SystemSnapshot | null): Promise<void> {
  const key = apiKey()
  const state = getReasoningState()
  state.model = reasoningModel()
  if (!key) {
    state.status = 'unconfigured'
    state.error = null
    saveReasoningState(state)
    return
  }
  if (state.nextAttemptAt && Date.now() < new Date(state.nextAttemptAt).getTime()) return
  if (state.pending.length === 0) {
    state.status = state.lastRunAt ? 'ready' : 'idle'
    saveReasoningState(state)
    return
  }
  state.status = 'running'
  state.error = null
  saveReasoningState(state)
  try {
    const output = await runReasoningRequest(key, state.model, createDigest(snapshot))
    const allowedFingerprints = new Set(state.pending.map((candidate) => candidate.fingerprint))
    const assessments = output.assessments.filter((assessment) => allowedFingerprints.has(assessment.fingerprint))
    const assessedFingerprints = new Set(assessments.map((assessment) => assessment.fingerprint))
    for (const candidate of state.pending) {
      if (!assessedFingerprints.has(candidate.fingerprint)) assessments.push({
        fingerprint: candidate.fingerprint,
        verdict: 'protect',
        confidence: 1,
        reason: 'The model omitted this candidate, so Lifeguard protected it by default.'
      })
    }
    const latest = getReasoningState()
    latest.status = 'ready'
    latest.lastRunAt = new Date().toISOString()
    latest.nextAttemptAt = null
    latest.failureCount = 0
    latest.summary = output.summary.slice(0, 300)
    latest.observations = output.observations.map((item) => item.slice(0, 200)).slice(0, 4)
    latest.assessments = [...assessments, ...latest.assessments.filter((item) => !allowedFingerprints.has(item.fingerprint))].slice(0, 200)
    latest.error = null
    saveReasoningState(latest)
  } catch (error) {
    const failed = getReasoningState()
    failed.status = 'error'
    failed.failureCount += 1
    const retryDelay = Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(8, failed.failureCount - 1))
    failed.nextAttemptAt = new Date(Date.now() + retryDelay).toISOString()
    failed.error = error instanceof Error ? error.message.slice(0, 180) : 'Reasoning request failed.'
    saveReasoningState(failed)
  }
}

export function maybeRunReasoning(snapshot: SystemSnapshot | null): Promise<void> {
  if (reasoningInFlight) return reasoningInFlight
  reasoningInFlight = executeReasoning(snapshot).finally(() => {
    reasoningInFlight = null
  })
  return reasoningInFlight
}

export function takeReasoningApprovedCandidates(): CleanupCandidate[] {
  const state = getReasoningState()
  const byFingerprint = new Map(state.assessments.map((assessment) => [assessment.fingerprint, assessment]))
  const approved: CleanupCandidate[] = []
  const remaining: ReasoningCandidateRecord[] = []
  for (const candidate of state.pending) {
    const assessment = byFingerprint.get(candidate.fingerprint)
    if (!assessment) {
      remaining.push(candidate)
      continue
    }
    if (assessment.verdict === 'neutral' && assessment.confidence >= 0.5) {
      const { fingerprint: _fingerprint, ...cleanupCandidate } = candidate
      approved.push(cleanupCandidate)
    }
  }
  state.pending = remaining
  saveReasoningState(state)
  return approved
}

export function getReasoningPublicState(): ReasoningPublicState {
  const { pending, ...state } = getReasoningState()
  const configured = Boolean(apiKey())
  return {
    ...state,
    status: configured ? state.status : 'unconfigured',
    keyConfigured: configured,
    pendingCount: pending.length,
    protectedCount: state.assessments.filter((assessment) => assessment.verdict === 'protect').length
  }
}
