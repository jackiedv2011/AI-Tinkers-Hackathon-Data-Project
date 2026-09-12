import type { LifeguardState, Profile } from '../../shared/types'
export type Page = 'Home' | 'Activity' | 'Quarantine' | 'Rules' | 'Devices' | 'Settings'
export type DesktopSettings = { openAtLogin: boolean }
export interface HeadroomBridge {
  getState(): Promise<LifeguardState>
  getAppIcon(pid: number): Promise<string | null>
  refresh(): Promise<LifeguardState>
  updateProfile(partial: Partial<Profile>): Promise<LifeguardState>
  chooseProtectedFolder(): Promise<LifeguardState>
  startStorageScan(): Promise<LifeguardState>
  restore(id: string): Promise<LifeguardState>
  stageDemo(): Promise<LifeguardState>
  setWatching(watching: boolean): Promise<LifeguardState>
  onNavigate(callback: (page: Page) => void): () => void
  getSettings(): Promise<DesktopSettings>
  updateSettings(settings: DesktopSettings): Promise<DesktopSettings>
}
// A browser without the preload must not impersonate a connected desktop.
export const bridge: HeadroomBridge | undefined = window.lifeguard
