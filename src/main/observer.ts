import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DriveInfo, ProcessInfo, SystemSnapshot } from '../shared/types'

const execFileAsync = promisify(execFile)

const windowsScript = String.raw`
$ErrorActionPreference = 'Stop'
if (-not ('LifeguardForeground' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LifeguardForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
}
$hwnd = [LifeguardForeground]::GetForegroundWindow()
[uint32]$foregroundPid = 0
[void][LifeguardForeground]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid)
$os = Get-CimInstance Win32_OperatingSystem
$processes = Get-Process | ForEach-Object {
  [PSCustomObject]@{
    pid = $_.Id
    name = $_.ProcessName
    memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    cpu = if ($null -eq $_.CPU) { $null } else { [math]::Round($_.CPU, 1) }
    hasWindow = $_.MainWindowHandle -ne 0
  }
}
[PSCustomObject]@{
  availableMemoryMb = [math]::Round($os.FreePhysicalMemory / 1024, 1)
  foregroundPid = if ($foregroundPid -eq 0) { $null } else { [int]$foregroundPid }
  processes = $processes
} | ConvertTo-Json -Depth 4 -Compress
`

async function observeWindows(): Promise<SystemSnapshot> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsScript], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024
  })
  const raw = JSON.parse(stdout) as {
    availableMemoryMb: number
    foregroundPid: number | null
    processes: ProcessInfo[]
  }
  const foreground = raw.processes.find((process) => process.pid === raw.foregroundPid)
  return {
    platform: 'win32',
    availableMemoryMb: raw.availableMemoryMb,
    foregroundPid: raw.foregroundPid,
    foregroundName: foreground?.name ?? null,
    processes: raw.processes,
    observedAt: new Date().toISOString()
  }
}

async function observeMac(): Promise<SystemSnapshot> {
  const [{ stdout: ps }, { stdout: vm }, foregroundPid] = await Promise.all([
    execFileAsync('ps', ['-axo', 'pid=,comm=,rss=,%cpu=']),
    execFileAsync('vm_stat', []),
    getMacForegroundPid()
  ])
  const processes = ps
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 4)
    .map((parts) => ({
      pid: Number(parts[0]),
      name: parts[1].split('/').pop() ?? parts[1],
      memoryMb: Math.round((Number(parts[2]) / 1024) * 10) / 10,
      cpu: Number(parts[3]) || null,
      hasWindow: false
    }))
  const freePages = Number(vm.match(/Pages free:\s+(\d+)/)?.[1] ?? 0)
  const pageSize = Number(vm.match(/page size of (\d+) bytes/)?.[1] ?? 4096)
  const foreground = processes.find((process) => process.pid === foregroundPid)
  return {
    platform: 'darwin',
    availableMemoryMb: Math.round((freePages * pageSize) / 1024 / 1024),
    foregroundPid,
    foregroundName: foreground?.name ?? null,
    processes,
    observedAt: new Date().toISOString()
  }
}

async function getMacForegroundPid(): Promise<number | null> {
  try {
    const script = 'tell application "System Events" to get unix id of first application process whose frontmost is true'
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    const pid = Number(stdout.trim())
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    // Without macOS Accessibility permission, fail closed: no process action is allowed.
    return null
  }
}

export async function observeSystem(): Promise<SystemSnapshot> {
  if (process.platform === 'win32') return observeWindows()
  if (process.platform === 'darwin') return observeMac()
  return {
    platform: 'other',
    availableMemoryMb: 0,
    foregroundPid: null,
    foregroundName: null,
    processes: [],
    observedAt: new Date().toISOString()
  }
}

export async function discoverFixedDrives(): Promise<DriveInfo[]> {
  if (process.platform === 'win32') {
    const script = String.raw`Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { [PSCustomObject]@{ root = "$($_.DeviceID)\\"; label = if ($_.VolumeName) { $_.VolumeName } else { $_.DeviceID }; totalBytes = [double]$_.Size; freeBytes = [double]$_.FreeSpace } } | ConvertTo-Json -Compress`
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true
    })
    const parsed = JSON.parse(stdout || '[]') as DriveInfo | DriveInfo[]
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((drive) => drive.root && drive.totalBytes > 0)
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('df', ['-kP', '-l'])
    const rows = stdout.trim().split('\n').slice(1)
    const seen = new Set<string>()
    const drives: DriveInfo[] = []
    for (const row of rows) {
      const parts = row.trim().split(/\s+/)
      if (parts.length < 6) continue
      const root = parts.slice(5).join(' ')
      if (seen.has(root) || root.startsWith('/System/Volumes/')) continue
      seen.add(root)
      drives.push({
        root,
        label: root === '/' ? 'Macintosh HD' : root.split('/').pop() || root,
        totalBytes: Number(parts[1]) * 1024,
        freeBytes: Number(parts[3]) * 1024
      })
    }
    return drives
  }
  return []
}

export async function requestGracefulClose(pid: number): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      const bundleLookup = `tell application "System Events" to get bundle identifier of first application process whose unix id is ${pid}`
      const { stdout: bundleId } = await execFileAsync('osascript', ['-e', bundleLookup])
      const appId = bundleId.trim().replace(/[^a-zA-Z0-9._-]/g, '')
      if (!appId) return false
      await execFileAsync('osascript', ['-e', `tell application id "${appId}" to quit`])
      return true
    } catch {
      return false
    }
  }
  if (process.platform !== 'win32') return false
  const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -ne $p -and $p.MainWindowHandle -ne 0) { [void]$p.CloseMainWindow(); Start-Sleep -Milliseconds 1200; $p.Refresh(); $p.HasExited } else { $false }`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true
  })
  return stdout.trim().toLowerCase() === 'true'
}
