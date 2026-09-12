import React from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, File, Pause } from 'lucide-react'
import type { ActionLogEntry, LifeguardState } from '../../shared/types'
import type { Page } from './bridge'
import { actionTitle, dateTime } from './format'
export type Run = (label: string, task: () => Promise<LifeguardState>) => Promise<boolean>
export type ScreenProps = { state: LifeguardState | null; busy: string | null; run: Run; navigate: (page: Page) => void }
export function Empty({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="empty-state"><span className="empty-symbol"><Check size={20} strokeWidth={1.5} /></span><h3>{title}</h3><p>{children}</p></div>
}
export function Receipt({ entry, navigate }: { entry: ActionLogEntry; navigate: (page: Page) => void }): React.JSX.Element {
  const isFile = entry.type === 'file_quarantine' || entry.type === 'cache_quarantine'
  return <article className="receipt-row"><span className={`receipt-symbol ${entry.type === 'restore' ? 'restored' : entry.type === 'process_paused' ? 'process' : ''}`}>{entry.type === 'restore' ? <ArrowDownLeft size={18} /> : entry.type === 'process_paused' ? <Pause size={16} /> : <File size={18} />}</span><div className="receipt-content"><div className="receipt-heading"><h3>{actionTitle(entry.type)}</h3><time dateTime={entry.timestamp}>{dateTime(entry.timestamp)}</time></div><p>{entry.detail}</p><details><summary>Why this happened <ChevronRight size={12} /></summary><p className="technical">Policy: {entry.rule}</p><p>{entry.type === 'process_paused' ? 'Closed gracefully. Reopening an app does not restore its previous session.' : entry.type === 'restore' ? 'Returned from quarantine. The recorded destination is shown above.' : 'Held in recoverable quarantine. Review its current recovery status in Quarantine.'}</p></details>{isFile && <button className="text-button" onClick={() => navigate('Quarantine')}>Review & restore <ArrowUpRight size={13} /></button>}</div></article>
}
