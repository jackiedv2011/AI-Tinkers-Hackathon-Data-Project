export const bytes = (value: number): string => {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(4, Math.max(0, Math.floor(Math.log(Math.abs(value)) / Math.log(1024))))
  return `${(value / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: index > 1 ? 1 : 0 })} ${units[index]}`
}
export const filename = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() || path
export const dateTime = (iso: string): string => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
export const actionTitle = (type: string): string => ({ file_quarantine: 'Duplicate held safely', cache_quarantine: 'Disposable file held safely', process_paused: 'Idle app closed gracefully', restore: 'File restored' }[type] || 'Action recorded')
