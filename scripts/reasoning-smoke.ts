import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { runReasoningRequest, type LifeguardReasoningEffort, type ReasoningDigest } from '../src/main/reasoning-client'

loadEnv({ path: resolve('.env.local'), override: false, quiet: true })
const apiKey = process.env.OPENAI_API_KEY?.trim()
if (!apiKey || !/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  console.error('OPENAI_API_KEY is not configured. Copy .env.example to .env.local and add the key locally.')
  process.exit(2)
}

const model = process.env.LIFEGUARD_REASONING_MODEL?.trim() || 'gpt-5.6-luna'
const requestedEffort = process.env.LIFEGUARD_REASONING_EFFORT?.trim().toLowerCase()
const effort: LifeguardReasoningEffort = requestedEffort === 'low' || requestedEffort === 'high' ? requestedEffort : 'medium'
const digest: ReasoningDigest = {
  platform: process.platform,
  freeMemoryBucket: 'moderate',
  fixedVolumeCount: 1,
  indexedFileCount: 12500,
  previousRestoreCount: 1,
  candidates: [{
    fingerprint: 'synthetic-candidate-001',
    category: 'duplicate',
    extension: '.zip',
    sizeMb: 48,
    ageDays: 75,
    locationClass: 'downloads',
    baseImportance: -25,
    evidence: ['sha256_exact_duplicate', 'deterministic_safety_gate_passed', 'recent_and_protected_paths_already_excluded']
  }]
}

async function main(): Promise<void> {
  const result = await runReasoningRequest(apiKey!, model, digest, effort)
  if (!result.assessments.some((assessment) => assessment.fingerprint === 'synthetic-candidate-001')) {
    throw new Error('The reasoning response did not assess the synthetic candidate.')
  }
  console.log(`Reasoning smoke test passed with ${model} at ${effort} effort.`)
  console.log(`Verdict: ${result.assessments[0].verdict}; raw paths and file contents were not transmitted.`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Reasoning smoke test failed.')
  process.exitCode = 1
})
