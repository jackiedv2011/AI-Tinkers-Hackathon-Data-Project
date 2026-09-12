import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArchiveRestore, BrainCircuit, CheckCircle2, Gauge, HardDrive, Play, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { LifeguardState } from '../../shared/types'
import './styles.css'

const bytes = (value: number): string => {
  if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(1)} TB`
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(value / 1024 ** 2))} MB`
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

let previewState: LifeguardState = {
  profile: {
    protectedFolders: ['C:\\Projects\\AI-Tinkers-Hackathon-Data-Project'],
    protectedApps: ['Code', 'Terminal'],
    autoPausableApps: ['Discord', 'Slack', 'Teams', 'Spotify', 'Steam'],
    quarantineFolder: 'C:\\Users\\you\\AppData\\Roaming\\Lifeguard\\Quarantine',
    duplicateAgeDays: 30,
    disposableAgeDays: 14,
    memoryThresholdMb: 1024,
    idleMinutes: 45,
    scanBudgetFiles: 500,
    scanBudgetMs: 1500,
    minCandidateSizeBytes: 1048576,
    learningHours: 24,
    armedAt: new Date(Date.now() - 36 * 3_600_000).toISOString(),
    demoMode: false
  },
  actions: [],
  quarantine: [],
  snapshot: { platform: 'win32', availableMemoryMb: 6180, foregroundPid: 1, foregroundName: 'Code', processes: [], observedAt: new Date().toISOString() },
  storage: {
    volumes: [{ root: 'C:\\', label: 'System', totalBytes: 1024 ** 4, freeBytes: 412 * 1024 ** 3 }],
    queue: ['C:\\Users'], processedFiles: 18243, processedBytes: 126 * 1024 ** 3, excludedPaths: 94, errors: 2,
    cycle: 1, status: 'indexing', cycleStartedAt: new Date().toISOString(), lastCompletedAt: null, lastTickAt: new Date().toISOString(), representatives: {}, hashes: {}
  },
  watching: true
}

const previewBridge = {
  getState: async () => previewState,
  refresh: async () => previewState,
  updateProfile: async (partial: Partial<LifeguardState['profile']>) => {
    previewState = { ...previewState, profile: { ...previewState.profile, ...partial } }
    return previewState
  },
  chooseProtectedFolder: async () => previewState,
  startStorageScan: async () => previewState,
  restore: async () => previewState,
  stageDemo: async () => previewState
}

const bridge = window.lifeguard ?? previewBridge

function App(): React.JSX.Element {
  const [state, setState] = useState<LifeguardState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (label: string, task: () => Promise<LifeguardState>): Promise<void> => {
    setBusy(label)
    setError(null)
    try {
      setState(await task())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lifeguard could not complete that action.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void bridge.getState().then(setState)
    const id = window.setInterval(() => void bridge.getState().then(setState).catch(() => undefined), 4000)
    return () => window.clearInterval(id)
  }, [])

  const activeQuarantine = useMemo(() => state?.quarantine.filter((item) => !item.restoredAt) ?? [], [state])
  const reclaimedBytes = activeQuarantine.reduce((total, entry) => total + entry.sizeBytes, 0)
  const learningUntil = state ? new Date(state.profile.armedAt).getTime() + state.profile.learningHours * 3_600_000 : 0
  const isLearning = Date.now() < learningUntil
  const snapshot = state?.snapshot

  if (!state) return <div className="loading">Waking Lifeguard…</div>

  return (
    <main>
      <header>
        <div className="brand"><div className="brand-mark"><ShieldCheck size={25} /></div><span>Lifeguard</span></div>
        <div className="status"><span className="pulse" /> Autonomous protection is on <span className="muted">· local only</span></div>
        <button className="icon-button" title="Refresh live state" onClick={() => void run('refresh', () => bridge.refresh())}><RefreshCw size={17} className={busy === 'refresh' ? 'spin' : ''} /></button>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">WHOLE-COMPUTER RESOURCE GUARDIAN</p>
          <h1>Your computer takes care<br />of itself now.</h1>
          <p className="hero-copy">No folders to choose and no cleanup prompts. Lifeguard quietly indexes every fixed drive, learns what matters, and makes only high-confidence, reversible moves.</p>
        </div>
        <div className="hero-signal">
          <span className="signal-label">AVAILABLE MEMORY</span>
          <strong>{snapshot ? `${Math.round(snapshot.availableMemoryMb / 1024 * 10) / 10} GB` : '—'}</strong>
          <span>{snapshot?.foregroundName ? `${snapshot.foregroundName} is protected in focus` : 'Reading desktop context'}</span>
        </div>
      </section>

      {error && <div className="error"><X size={16} /> {error}</div>}

      <section className="grid">
        <article className="card drive-card">
          <div className="card-title"><HardDrive size={19} /> <span>Whole-drive coverage</span><span className="live-pill">LIVE</span></div>
          <div className="drive-list">
            {state.storage.volumes.length === 0 && <p className="secondary">Discovering fixed volumes…</p>}
            {state.storage.volumes.map((drive) => {
              const used = drive.totalBytes ? Math.round((1 - drive.freeBytes / drive.totalBytes) * 100) : 0
              return <div className="drive-row" key={drive.root}><span>{drive.root} <b>{drive.label}</b></span><span>{used}% used</span></div>
            })}
          </div>
          <div className="context-line"><Activity size={15} /> {state.storage.processedFiles.toLocaleString()} files observed this cycle</div>
          <button className="text-button" disabled={Boolean(busy)} onClick={() => void run('scan', () => bridge.startStorageScan())}>Restart full inventory</button>
        </article>

        <article className="card handled-card">
          <div className="card-title"><Sparkles size={19} /> <span>Space held safely</span><span className="count">{activeQuarantine.length}</span></div>
          <div className="handled-number">{reclaimedBytes ? bytes(reclaimedBytes) : '—'}</div>
          <p className="secondary">Removed from active storage, never permanently deleted.</p>
          <div className="memory-rule"><ArchiveRestore size={15} /> One-click recovery stays available</div>
        </article>

        <article className="card intelligence-card">
          <div className="card-title"><BrainCircuit size={19} /> <span>Personal context</span><span className="count">{isLearning ? 'LEARNING' : 'ARMED'}</span></div>
          <p className="primary">{isLearning ? 'Learning your working set' : 'Protection model active'}</p>
          <p className="secondary">Recent work, personal folders, source code, foreground apps, projects, and restores raise importance. Old caches and exact redundant copies lower it.</p>
          <div className="memory-rule"><ShieldCheck size={15} /> System, sync, and protected zones are hard exclusions</div>
        </article>

        <article className="card demo-card">
          <div className="card-title"><Play size={19} /> <span>Two-minute proof</span></div>
          <p className="primary">Watch it act by itself</p>
          <p className="secondary">Stages a synthetic duplicate and isolated memory worker. After this click, the policy discovers and handles both autonomously.</p>
          <button className="primary-button" disabled={Boolean(busy)} onClick={() => void run('demo', () => bridge.stageDemo())}><Play size={15} /> {busy === 'demo' ? 'Staging…' : 'Stage safe live demo'}</button>
        </article>
      </section>

      <section className="telemetry-strip">
        <div><Gauge size={16} /><span>Indexer</span><b>{state.storage.status}</b></div>
        <div><HardDrive size={16} /><span>Observed</span><b>{bytes(state.storage.processedBytes)}</b></div>
        <div><ShieldCheck size={16} /><span>Excluded safely</span><b>{state.storage.excludedPaths.toLocaleString()} paths</b></div>
        <div><BrainCircuit size={16} /><span>Scan queue</span><b>{state.storage.queue.length.toLocaleString()}</b></div>
      </section>

      <section className="bottom-grid">
        <article className="panel audit-panel">
          <div className="panel-heading"><div><p className="eyebrow">AUTONOMY YOU CAN AUDIT</p><h2>What Lifeguard did</h2></div><span>No recommendations. Only completed actions.</span></div>
          <div className="activity-list">
            {state.actions.length === 0 && <div className="empty"><CheckCircle2 size={20} /> Observing quietly. No safe action was necessary.</div>}
            {state.actions.map((entry) => <div className="activity-item" key={entry.id}>
              <div className={`activity-icon ${entry.type}`}><CheckCircle2 size={16} /></div>
              <div><p>{entry.detail}</p><span>{entry.rule} · {time(entry.timestamp)}</span></div>
            </div>)}
          </div>
        </article>

        <article className="panel held-panel">
          <div className="panel-heading"><div><p className="eyebrow">SILENT RECOVERY LEDGER</p><h2>Quarantine</h2></div><span>{activeQuarantine.length} recoverable</span></div>
          <div className="held-list">
            {activeQuarantine.length === 0 && <div className="empty"><ArchiveRestore size={20} /> High-confidence cleanup lands here first.</div>}
            {activeQuarantine.map((entry) => <div className="held-item" key={entry.id}>
              <div><p>{entry.originalPath.split(/[\\/]/).pop()}</p><span>{bytes(entry.sizeBytes)} · {entry.category}</span></div>
              <button className="restore-button" disabled={Boolean(busy)} onClick={() => void run(`restore-${entry.id}`, () => bridge.restore(entry.id))}>Restore</button>
            </div>)}
          </div>
        </article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
