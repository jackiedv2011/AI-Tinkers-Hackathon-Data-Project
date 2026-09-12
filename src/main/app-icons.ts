import { app, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { getState } from './agent'
const execFileAsync = promisify(execFile)
const cache = new Map<number, { expires: number; data: string | null }>()
export async function getAppIcon(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid < 1 || !getState().snapshot?.processes.some(item => item.pid === pid)) return null
  if (pid === process.pid) return nativeImage.createFromPath(join(__dirname, '../renderer/art/headroom-icon.png')).toDataURL()
  const saved = cache.get(pid)
  if (saved && saved.expires > Date.now()) return saved.data
  let data: string | null = null
  try {
    let executable = ''
    if (process.platform === 'win32') {
      const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).Path`], { windowsHide: true, timeout: 5000 })
      executable = result.stdout.trim()
    } else if (process.platform === 'darwin') {
      const result = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 5000 })
      executable = result.stdout.trim().replace(/\.app\/Contents\/.*$/, '.app')
    }
    if (executable) { const icon = await app.getFileIcon(executable, { size: 'normal' }); if (!icon.isEmpty()) data = icon.toDataURL() }
  } catch { /* Some protected processes do not expose an executable. Use the UI fallback. */ }
  if (cache.size > 200) cache.clear()
  cache.set(pid, { data, expires: Date.now() + (data ? 300000 : 30000) })
  return data
}
