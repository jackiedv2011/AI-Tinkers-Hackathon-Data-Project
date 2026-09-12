/// <reference types="vite/client" />

import type { Profile } from '../../shared/types'

declare global {
  interface Window {
    lifeguard?: {
      getState: () => Promise<import('../../shared/types').LifeguardState>
      refresh: () => Promise<import('../../shared/types').LifeguardState>
      updateProfile: (partial: Partial<Profile>) => Promise<import('../../shared/types').LifeguardState>
      chooseProtectedFolder: () => Promise<import('../../shared/types').LifeguardState>
      chooseDownloadsFolder: () => Promise<import('../../shared/types').LifeguardState>
      scanDuplicates: () => Promise<import('../../shared/types').LifeguardState>
      restore: (id: string) => Promise<import('../../shared/types').LifeguardState>
      stageDemo: () => Promise<import('../../shared/types').LifeguardState>
    }
  }
}
