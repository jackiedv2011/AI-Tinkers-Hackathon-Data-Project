import { extname, relative, resolve, sep } from 'node:path'

export type DisposableCategory = 'cache' | 'temp' | null

function normalized(value: string): string {
  const result = resolve(value).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? result.toLowerCase() : result
}

export function isInside(candidate: string, parent: string): boolean {
  const pathBetween = relative(resolve(parent), resolve(candidate))
  return pathBetween === '' || (!pathBetween.startsWith('..') && !pathBetween.startsWith('/') && !pathBetween.startsWith('\\'))
}

export function classifyDisposablePath(filePath: string, userHome: string, platform = process.platform): DisposableCategory {
  const path = normalized(filePath)
  const home = normalized(userHome)
  if (!isInside(path, home)) return null
  if (platform === 'win32') {
    const local = `${home}${sep}appdata${sep}local${sep}`
    if (!path.startsWith(local)) return null
    if (path.includes(`${sep}temp${sep}`) || path.endsWith(`${sep}temp`) || path.includes(`${sep}crashdumps${sep}`) || path.endsWith(`${sep}crashdumps`)) return 'temp'
    if (path.includes(`${sep}cache${sep}`) || path.endsWith(`${sep}cache`) || path.includes(`${sep}code cache${sep}`) || path.endsWith(`${sep}code cache`) || path.includes(`${sep}gpucache${sep}`) || path.endsWith(`${sep}gpucache`)) return 'cache'
    return null
  }
  if (path === `${home}/library/caches` || path.startsWith(`${home}/library/caches/`)) return 'cache'
  if (path === `${home}/library/logs` || path.startsWith(`${home}/library/logs/`)) return 'temp'
  return null
}

export function shouldSkipPath(filePath: string, userHome: string, protectedFolders: string[], quarantineFolder: string, platform = process.platform): boolean {
  const path = normalized(filePath)
  if (isInside(path, quarantineFolder) || protectedFolders.some((folder) => folder && isInside(path, folder))) return true
  const leafParts = path.split(/[\\/]/)
  if (leafParts.includes('.git') || leafParts.includes('node_modules')) return true

  if (platform === 'win32') {
    const root = /^[a-z]:/.exec(path)?.[0]
    if (root) {
      const blocked = ['windows', 'program files', 'program files (x86)', 'programdata', 'system volume information', '$recycle.bin', 'recovery']
      if (blocked.some((name) => isInside(path, `${root}\\${name}`))) return true
    }
    const appData = `${normalized(userHome)}${sep}appdata`
    if (isInside(path, appData) && !classifyDisposablePath(path, userHome, platform)) return true
  } else if (platform === 'darwin') {
    const blocked = ['/system', '/library', '/applications', '/usr', '/bin', '/sbin', '/dev', '/private', '/cores']
    if (blocked.some((folder) => isInside(path, folder))) return true
    const userLibrary = `${normalized(userHome)}/library`
    if (isInside(path, userLibrary) && !classifyDisposablePath(path, userHome, platform)) return true
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
