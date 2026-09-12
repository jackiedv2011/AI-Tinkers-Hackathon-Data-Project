import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'

const [mode, statePath, baselinePath] = process.argv.slice(2)
if (!mode || !statePath || !baselinePath) throw new Error('Usage: node native-state-check.mjs <snapshot|verify> <state-path> <baseline-path>')

function readState() {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { actions: [], quarantine: [], storageIndex: { volumes: [], processedFiles: 0 } }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    hash.on('error', reject)
    hash.on('finish', () => resolve(hash.digest('hex')))
    stream.pipe(hash)
  })
}

if (mode === 'snapshot') {
  const state = readState()
  writeFileSync(baselinePath, JSON.stringify({
    actionIds: state.actions.map((entry) => entry.id),
    quarantineIds: state.quarantine.map((entry) => entry.id),
    processedFiles: state.storageIndex.processedFiles ?? 0
  }))
  process.exit(0)
}

if (mode !== 'verify') throw new Error(`Unknown mode: ${mode}`)
const state = readState()
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const priorActions = new Set(baseline.actionIds)
const priorQuarantine = new Set(baseline.quarantineIds)
const actions = state.actions.filter((entry) => !priorActions.has(entry.id))
const entries = state.quarantine.filter((entry) => !priorQuarantine.has(entry.id))
const rules = new Set(actions.map((entry) => entry.rule))
const categories = new Set(entries.map((entry) => entry.category))
const integrity = await Promise.all(entries.map(async (entry) => {
  const filePath = entry.restoredAt ? entry.originalPath : entry.quarantinePath
  return existsSync(filePath) && await hashFile(filePath) === entry.hash
}))
const fixtureOnly = entries.every((entry) => /[\\/]DemoDrive[\\/]|[\\/]Lifeguard-Demo[\\/]/i.test(entry.originalPath))
const checks = {
  FixedDriveDiscovered: state.storageIndex.volumes.length > 0,
  IncrementalIndexAdvanced: state.storageIndex.processedFiles > baseline.processedFiles,
  DuplicateQuarantined: rules.has('whole-drive-exact-duplicate'),
  StaleTempQuarantined: rules.has('known-disposable-path'),
  MemoryWorkerClosed: rules.has('context-aware-memory-pressure'),
  RestoreCompleted: rules.has('quarantine-restore') && entries.some((entry) => entry.restoredAt),
  BothStorageCategories: categories.has('duplicate') && categories.has('temp'),
  IntegrityHashesValid: integrity.length >= 2 && integrity.every(Boolean),
  AllMutationsInsideFixtures: entries.length >= 2 && fixtureOnly,
  RecoverableItemRemains: entries.some((entry) => !entry.restoredAt)
}
for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`)
const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length) throw new Error(`Native verification failed: ${failures.join(', ')}`)
console.log(`Native verification passed: ${actions.length} actions, ${entries.length} storage items.`)
