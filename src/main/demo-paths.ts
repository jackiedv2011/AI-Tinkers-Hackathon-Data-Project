import { app } from 'electron'
import { join } from 'node:path'
import { isInside } from './path-policy'

export function getDemoFolders(): string[] {
  return [join(app.getPath('userData'), 'DemoDrive'), join(app.getPath('temp'), 'Lifeguard-Demo')]
}

export function isDemoPath(filePath: string): boolean {
  return getDemoFolders().some((folder) => isInside(filePath, folder))
}
