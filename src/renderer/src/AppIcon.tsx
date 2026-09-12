import React, { useEffect, useState } from 'react'
import { bridge } from './bridge'
const icons = new Map<number, Promise<string | null>>()
export function AppIcon({ pid, name }: { pid: number | null | undefined; name: string | null | undefined }): React.JSX.Element {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    setSource(null)
    if (!pid || !bridge) return
    let active = true
    let request = icons.get(pid)
    if (!request) { request = bridge.getAppIcon(pid).catch(() => null); icons.set(pid, request) }
    void request.then(value => { if (active) setSource(value); if (!value) icons.delete(pid) })
    return () => { active = false }
  }, [pid])
  return source ? <img className="app-icon" src={source} alt="" onError={() => setSource(null)} /> : <span className="app-icon app-icon-fallback" aria-hidden="true">{name?.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || '·'}</span>
}
