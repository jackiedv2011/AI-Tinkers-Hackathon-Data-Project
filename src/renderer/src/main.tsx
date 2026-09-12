import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArchiveRestore, CheckCircle2, FolderLock, HardDrive, Play, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { LifeguardState } from '../../shared/types'
import './styles.css'

const bytes = (value: number): string => {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(value / 1024 ** 2))} MB`
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The Electron preload supplies the real bridge. This preview bridge keeps the
// Vite renderer inspectable in a normal browser without granting it OS access.
let previewState: LifeguardState = {
  profile: {
    protectedFolders: ['C:\\Projects\\AI-Tinkers-Hackathon-Data-Project'],
    protectedApps: ['Code'],
    pausableProcesses: ['lifeguard-demo-worker'],
    downloadsFolder: 'C:\\Downloads',
    quarantineFolder: 'C:\\Lifeguard\\Quarantine',
    duplicateAgeDays: 30,
    memoryThresholdMb: 1024,
    idleMinutes: 20,
    demoMode: false
  },
  actions: [],
  quarantine: [],
  snapshot: { platform: 'win32', availableMemoryMb: 6180, foregroundPid: 1, foregroundName: 'Code', processes: [], observedAt: new Date().toISOString() },
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
  chooseDownloadsFolder: async () => previewState,
  scanDuplicates: async () => previewState,
  restore: async () => previewState,
  stageDemo: async () => previewState
}

const bridge = window.lifeguard ?? previewBridge

function App(): React.JSX.Element {
  const [state, setState] = useState<LifeguardState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [candidateProcess, setCandidateProcess] = useState('')

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
    const id = window.setInterval(() => void bridge.getState().then(setState).catch(() => undefined), 5000)
    return () => window.clearInterval(id)
  }, [])

  const activeQuarantine = useMemo(() => state?.quarantine.filter((item) => !item.restoredAt) ?? [], [state])
  const protectedFolder = state?.profile.protectedFolders[0]
  const downloadsFolder = state?.profile.downloadsFolder
  const snapshot = state?.snapshot
  const processNames = [...new Set(snapshot?.processes.map((process) => process.name) ?? [])].sort((a, b) => a.localeCompare(b))

  if (!state) return <div className="loading">Waking Lifeguard…</div>

  return (
    <main>
      <header>
        <div className="brand"><div className="brand-mark"><ShieldCheck size={25} /></div><span>Lifeguard</span></div>
        <div className="status"><span className="pulse" /> Watching quietly <span className="muted">· local only</span></div>
        <button className="icon-button" title="Refresh live state" onClick={() => void run('refresh', () => bridge.refresh())}><RefreshCw size={17} className={busy === 'refresh' ? 'spin' : ''} /></button>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">YOUR AUTONOMOUS RESOURCE GUARDIAN</p>
          <h1>Makes room for the work<br />that matters.</h1>
          <p className="hero-copy">Lifeguard protects a named project, then quietly reclaims only the resources you have approved.</p>
        </div>
        <div className="hero-signal">
          <span className="signal-label">AVAILABLE MEMORY</span>
          <strong>{snapshot ? `${Math.round(snapshot.availableMemoryMb / 1024 * 10) / 10} GB` : '—'}</strong>
          <span>{snapshot?.foregroundName ? `${snapshot.foregroundName} is in focus` : 'Reading desktop context'}</span>
        </div>
      </section>

      {error && <div className="error"><X size={16} /> {error}</div>}

      <section className="grid">
        <article className="card protected-card">
          <div className="card-title"><FolderLock size={19} /> <span>Protected now</span><span className="live-pill">LIVE</span></div>
          <div className="protected-body">
            <div className="folder-orb"><ShieldCheck size={31} /></div>
            <div>
              <p className="primary">{protectedFolder ? protectedFolder.split(/[\\/]/).filter(Boolean).pop() : 'Choose your project'}</p>
              <p className="secondary">{protectedFolder ? 'Named workspace - never touched by cleanup.' : 'Pick the folder where your work lives.'}</p>
            </div>
          </div>
          <div className="context-line"><Activity size={15} /> Foreground: <b>{snapshot?.foregroundName ?? 'observing…'}</b></div>
          <button className="text-button" onClick={() => void run('protected', () => bridge.chooseProtectedFolder())}>Change protected project</button>
        </article>

        <article className="card handled-card">
          <div className="card-title"><Sparkles size={19} /> <span>Quietly handled</span><span className="count">{state.actions.length}</span></div>
          <div className="handled-number">{state.actions.length === 0 ? '—' : state.actions.length}</div>
          <p className="secondary">{state.actions.length === 0 ? 'No actions yet. Lifeguard is observing safely.' : 'Reversible actions, recorded locally.'}</p>
          <div className="memory-rule"><HardDrive size={15} /> Acts only below {state.profile.memoryThresholdMb} MB free</div>
        </article>

        <article className="card quarantine-card">
          <div className="card-title"><ArchiveRestore size={19} /> <span>Quarantine</span><span className="count">{activeQuarantine.length}</span></div>
          <p className="primary">{activeQuarantine.length === 0 ? 'Nothing held' : `${activeQuarantine.length} file${activeQuarantine.length === 1 ? '' : 's'} held safely`}</p>
          <p className="secondary">Never deleted. Every file can return in one click.</p>
          <button className="text-button" onClick={() => void run('scan', () => bridge.scanDuplicates())} disabled={!downloadsFolder || Boolean(busy)}>Scan approved folder</button>
        </article>

        <article className="card demo-card">
          <div className="card-title"><Play size={19} /> <span>Live demo</span></div>
          <p className="primary">Stage real pressure</p>
          <p className="secondary">Creates an exact duplicate and a controlled inactive worker. The agent handles both on its own.</p>
          <button className="primary-button" disabled={!downloadsFolder || Boolean(busy)} onClick={() => void run('demo', () => bridge.stageDemo())}><Play size={15} /> {busy === 'demo' ? 'Staging…' : 'Stage live demo'}</button>
          {!downloadsFolder && <button className="text-button" onClick={() => void run('downloads', () => bridge.chooseDownloadsFolder())}>Choose approved folder first</button>}
          <div className="process-picker">
            <select aria-label="Choose a background process Lifeguard may pause" value={candidateProcess} onChange={(event) => setCandidateProcess(event.target.value)}>
              <option value="">Approve a background process…</option>
              {processNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button disabled={!candidateProcess || Boolean(busy)} onClick={() => void run('process', () => bridge.updateProfile({ pausableProcesses: [candidateProcess] }))}>Approve</button>
          </div>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel audit-panel">
          <div className="panel-heading"><div><p className="eyebrow">ONE REVERSIBLE POLICY</p><h2>Audit trail</h2></div><span>Every action is explained</span></div>
          <div className="activity-list">
            {state.actions.length === 0 && <div className="empty"><CheckCircle2 size={20} /> Lifeguard will write its first action here.</div>}
            {state.actions.map((entry) => <div className="activity-item" key={entry.id}>
              <div className={`activity-icon ${entry.type}`}><CheckCircle2 size={16} /></div>
              <div><p>{entry.detail}</p><span>{entry.rule} · {time(entry.timestamp)}</span></div>
            </div>)}
          </div>
        </article>

        <article className="panel held-panel">
          <div className="panel-heading"><div><p className="eyebrow">RECOVERABLE BY DESIGN</p><h2>Held safely</h2></div><span>{activeQuarantine.length} active</span></div>
          <div className="held-list">
            {activeQuarantine.length === 0 && <div className="empty"><ArchiveRestore size={20} /> Files move here before they ever disappear.</div>}
            {activeQuarantine.map((entry) => <div className="held-item" key={entry.id}>
              <div><p>{entry.originalPath.split(/[\\/]/).pop()}</p><span>{bytes(entry.sizeBytes)} · exact duplicate</span></div>
              <button className="restore-button" disabled={Boolean(busy)} onClick={() => void run(`restore-${entry.id}`, () => bridge.restore(entry.id))}>Restore</button>
            </div>)}
          </div>
        </article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
