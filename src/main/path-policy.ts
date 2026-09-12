import { extname, resolve } from 'node:path'

export type DisposableCategory = 'cache' | 'temp' | null

function pathPlatform(values: string[], fallback = process.platform): string {
  return values.some((value) => /^[a-z]:[\\/]/i.test(value)) ? 'win32' : fallback
}

function normalized(value: string, platform: string): string {
  if (platform === 'win32') {
    const result = value.replace(/\//g, '\\').replace(/\\+$/, '')
    return result.toLowerCase()
  }
  const result = resolve(value).replace(/[\\/]+$/, '')
  return result || '/'
}

export function isInside(candidate: string, parent: string, platform = pathPlatform([candidate, parent])): boolean {
  const normalizedCandidate = normalized(candidate, platform)
  const normalizedParent = normalized(parent, platform)
  const separator = platform === 'win32' ? '\\' : '/'
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${separator}`)
}

export function classifyDisposablePath(filePath: string, userHome: string, platform = process.platform): DisposableCategory {
  const path = normalized(filePath, platform)
  const home = normalized(userHome, platform)
  const separator = platform === 'win32' ? '\\' : '/'
  if (!isInside(path, home, platform)) return null
  if (platform === 'win32') {
    const local = `${home}${separator}appdata${separator}local${separator}`
    if (!path.startsWith(local)) return null
    if (path.includes(`${separator}temp${separator}`) || path.endsWith(`${separator}temp`) || path.includes(`${separator}crashdumps${separator}`) || path.endsWith(`${separator}crashdumps`)) return 'temp'
    if (path.includes(`${separator}cache${separator}`) || path.endsWith(`${separator}cache`) || path.includes(`${separator}code cache${separator}`) || path.endsWith(`${separator}code cache`) || path.includes(`${separator}gpucache${separator}`) || path.endsWith(`${separator}gpucache`)) return 'cache'
    return null
  }
  if (path === `${home}/library/caches` || path.startsWith(`${home}/library/caches/`)) return 'cache'
  if (path === `${home}/library/logs` || path.startsWith(`${home}/library/logs/`)) return 'temp'
  return null
}

export function shouldSkipPath(filePath: string, userHome: string, protectedFolders: string[], quarantineFolder: string, platform = process.platform): boolean {
  const path = normalized(filePath, platform)
  if (isInside(path, quarantineFolder, platform) || protectedFolders.some((folder) => folder && isInside(path, folder, platform))) return true
  const leafParts = path.split(/[\\/]/)
  if (leafParts.includes('.git') || leafParts.includes('node_modules')) return true

  if (platform === 'win32') {
    const root = /^[a-z]:/.exec(path)?.[0]
    if (root) {
      const blocked = ['windows', 'program files', 'program files (x86)', 'programdata', 'system volume information', '$recycle.bin', 'recovery']
      if (blocked.some((name) => isInside(path, `${root}\\${name}`, platform))) return true
    }
    const appData = `${normalized(userHome, platform)}\\appdata`
    if (isInside(path, appData, platform) && !classifyDisposablePath(path, userHome, platform)) return true
  } else if (platform === 'darwin') {
    const blocked = ['/system', '/library', '/applications', '/usr', '/bin', '/sbin', '/dev', '/private', '/cores']
    if (blocked.some((folder) => isInside(path, folder, platform))) return true
    const userLibrary = `${normalized(userHome, platform)}/library`
    if (isInside(path, userLibrary, platform) && !classifyDisposablePath(path, userHome, platform)) return true
  }
  return false
}

export function importanceScore(filePath: string, modifiedAt: number, accessedAt: number, protectedFolders: string[], category: DisposableCategory, now = Date.now()): number {
  if (protectedFolders.some((folder) => folder && isInside(filePath, folder))) return 1000
  let score = 0
  const ageDays = (now - Math.max(modifiedAt, accessedAt)) / 86_400_000
  if (ageDays < 7) score += 80
  else if (ageDays < 30) score += 35
  const normalizedPath = filePath.toLowerCase()
  if (/[\\/](desktop|documents|pictures|movies|music)[\\/]/.test(normalizedPath)) score += 45
  if (new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.swift', '.c', '.cpp', '.md']).has(extname(filePath).toLowerCase())) score += 35
  if (category === 'cache') score -= 100
  if (category === 'temp') score -= 120
  if (new Set(['.exe', '.msi', '.dmg', '.pkg']).has(extname(filePath).toLowerCase())) score -= 25
  return score
}
