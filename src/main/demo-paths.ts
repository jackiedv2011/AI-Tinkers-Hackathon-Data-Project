import { app } from 'electron'
import { join } from 'node:path'
import { isInside } from './path-policy'

export function getDemoFolders(): string[] {
  const home = app.getPath('home')
  const disposableFixture = process.platform === 'win32'
    ? join(home, 'AppData', 'Local', 'Temp', 'Lifeguard-Demo')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Caches', 'Lifeguard-Demo')
      : join(app.getPath('temp'), 'Lifeguard-Demo')
  return [join(app.getPath('userData'), 'DemoDrive'), disposableFixture]
}

export function isDemoPath(filePath: string): boolean {
  return getDemoFolders().some((folder) => isInside(filePath, folder))
}
