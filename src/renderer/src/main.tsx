import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, ChevronRight, Home, Layers, Monitor, RefreshCw, RotateCcw, Settings, SlidersHorizontal, X } from 'lucide-react'
import type { LifeguardState } from '../../shared/types'
import { bridge, type Page } from './bridge'
import type { Run } from './components'
import { HomeScreen } from './HomeScreen'
import { ActivityScreen, QuarantineScreen } from './RecoveryScreens'
import { RulesScreen } from './RulesScreen'
import { DevicesScreen, SettingsScreen } from './SettingsScreens'
import './styles.css'
const navigation = [{ name: 'Home', icon: Home }, { name: 'Activity', icon: Layers }, { name: 'Quarantine', icon: RotateCcw }, { name: 'Rules', icon: SlidersHorizontal }, { name: 'Devices', icon: Monitor }, { name: 'Settings', icon: Settings }] as const
function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('Home'), [state, setState] = useState<LifeguardState | null>(null)
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(''), [loaded, setLoaded] = useState(!bridge)
  const generation = useRef(0), inAction = useRef(false), main = useRef<HTMLElement>(null)
  const navigate = useCallback((next: Page) => { if (!navigation.some(item => item.name === next)) return; setPage(next); main.current?.scrollTo({ top: 0 }); }, [])
  const run: Run = useCallback(async (label, task) => {
    if (inAction.current) return false
    inAction.current = true; generation.current++; setBusy(label); setError(null); setNotice('')
    try { setState(await task()); setNotice(label.startsWith('Restoring') ? 'File restored. Its recovery receipt is in Activity.' : label === 'Saving process rule' ? 'Your rule is saved.' : ''); return true }
    catch (cause) { setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Headroom could not complete that action. Please try again.'); return false }
    finally { inAction.current = false; setBusy(null); setLoaded(true) }
  }, [])
  useEffect(() => {
    if (!bridge) return
    let active = true, fetching = false
    const poll = async (): Promise<void> => {
      if (fetching || inAction.current) return
      fetching = true; const current = generation.current
      try { const next = await bridge!.getState(); if (active && current === generation.current) { setState(next); setLoaded(true) } }
      catch { if (active) { setError('Could not reach the desktop agent. Your last known state is shown.'); setLoaded(true) } }
      finally { fetching = false }
    }
    void poll(); const interval = window.setInterval(() => void poll(), 4000)
    const unsubscribe = bridge.onNavigate(navigate)
    return () => { active = false; window.clearInterval(interval); unsubscribe() }
  }, [navigate])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 6500); return () => window.clearTimeout(timer) }, [notice])
  const props = { state, busy, run, navigate }, count = state?.quarantine.filter(item => !item.restoredAt).length ?? 0
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><button className="brand" onClick={() => navigate('Home')} aria-label="Headroom home"><img className="brand-mark" src="./art/headroom-mark.svg" alt="" /><span>Headroom.</span></button><nav aria-label="Main navigation">{navigation.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? 'active' : ''}`} aria-current={page === name ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={18} strokeWidth={1.6} /><span>{name}</span>{name === 'Quarantine' && count > 0 && <small>{count}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-status"><span className={`status-dot ${!state?.watching ? 'paused' : ''}`} /><span>{!bridge ? 'Desktop preview' : !state ? 'Connecting…' : !state.watching ? 'Paused' : state.acting ? 'Checking your system' : 'Watching quietly'}</span></div><p>Room for what matters.</p></div></aside><main ref={main} id="main-content" tabIndex={-1}><header className="topbar"><span>My workspace <ChevronRight size={12} /> <strong>{page}</strong></span><div><span className="device-label"><Monitor size={14} />This computer</span><button className="icon-button" aria-label="Run a protection check" title="Run a protection check" disabled={!bridge || !!busy} onClick={() => void run('Checking system', () => bridge!.refresh())}><RefreshCw size={15} className={busy === 'Checking system' ? 'spin' : ''} /></button></div></header><div className="page-content">{!bridge && <div className="connection-note"><Monitor size={15} />Desktop preview · System data and actions are available in the Electron app.</div>}{error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}{notice && <div className="success-banner" role="status"><Check size={16} />{notice}</div>}{!loaded ? <div className="loading-state" role="status"><p className="eyebrow">Headroom.</p><h1>Finding a little room.</h1><div /><div /><p>Connecting to your desktop agent…</p></div> : <div className="screen" key={page}>{page === 'Home' ? <HomeScreen {...props} /> : page === 'Activity' ? <ActivityScreen {...props} /> : page === 'Quarantine' ? <QuarantineScreen {...props} /> : page === 'Rules' ? <RulesScreen {...props} /> : page === 'Devices' ? <DevicesScreen {...props} /> : <SettingsScreen {...props} />}</div>}</div><div className={`busy-indicator ${busy ? 'visible' : ''}`} role="status" aria-live="polite">{busy && <><span className="status-dot" />{busy}…</>}</div></main></div>
}
createRoot(document.getElementById('root')!).render(<App />)


